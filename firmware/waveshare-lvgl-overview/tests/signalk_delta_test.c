#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "telemetry/signalk_delta.h"
#include "telemetry/telemetry_state.h"

static void test_valid_values_and_null(void)
{
    const char *delta =
        "{\"updates\":[{\"timestamp\":\"2026-07-30T20:14:42.961Z\",\"values\":["
        "{\"path\":\"navigation.speedOverGround\",\"value\":3.25},"
        "{\"path\":\"environment.depth.belowSurface\",\"value\":null},"
        "{\"path\":\"unknown.path\",\"value\":9}]}]}";

    telemetry_state_init();
    assert(signalk_delta_apply(delta, strlen(delta), 4200) == 2);

    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    assert(state.speed_over_ground_mps.valid);
    assert(fabs(state.speed_over_ground_mps.value - 3.25) < 0.0001);
    assert(!state.depth_below_surface_m.valid);
    assert(state.signalk_clock.valid);
    assert(state.signalk_clock.epoch_ms == 1785442482961);
    assert(state.signalk_clock.received_ms == 4200);
}

static void test_malformed_and_missing_values_are_ignored(void)
{
    telemetry_state_init();
    assert(signalk_delta_apply(NULL, 0, 1) == 0);
    assert(signalk_delta_apply("{", 1, 1) == 0);

    const char *missing = "{\"updates\":[{\"source\":{\"label\":\"test\"}}]}";
    assert(signalk_delta_apply(missing, strlen(missing), 1) == 0);
}

static void test_position_object_marks_gps_live(void)
{
    const char *delta =
        "{\"updates\":[{\"timestamp\":\"2026-07-30T20:14:42Z\",\"values\":["
        "{\"path\":\"navigation.position\","
        "\"value\":{\"latitude\":55.9,\"longitude\":-4.3}}]}]}";
    telemetry_state_init();
    assert(signalk_delta_apply(delta, strlen(delta), 9000) == 1);
    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    assert(state.gps_quality.valid);
    assert(state.gps_quality.updated_ms == 9000);
    assert(state.last_delta_ms == 9000);
}

static void test_self_and_moving_ais_contexts_are_separated(void)
{
    const char *hello = "{\"self\":\"urn:mrn:signalk:uuid:self\"}";
    const char *own =
        "{\"context\":\"vessels.urn:mrn:signalk:uuid:self\","
        "\"updates\":[{\"values\":[{\"path\":\"navigation.position\","
        "\"value\":{\"latitude\":55.9,\"longitude\":-4.3}}]}]}";
    const char *target =
        "{\"context\":\"vessels.urn:mrn:imo:mmsi:123456789\","
        "\"updates\":[{\"values\":["
        "{\"path\":\"navigation.position\","
        "\"value\":{\"latitude\":55.91,\"longitude\":-4.29}},"
        "{\"path\":\"navigation.speedOverGround\",\"value\":3.0}]}]}";

    telemetry_state_init();
    assert(signalk_delta_apply(hello, strlen(hello), 1000) == 0);
    assert(signalk_delta_apply(own, strlen(own), 2000) == 1);
    assert(signalk_delta_apply(target, strlen(target), 3000) == 2);

    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    assert(state.own_position_valid);
    assert(state.ais_targets[0].used);
    assert(state.ais_targets[0].position_valid);
    assert(state.ais_targets[0].speed_over_ground_mps.valid);
    assert(!state.speed_over_ground_mps.valid);
}

static void test_anchor_values_notification_and_nulls(void)
{
    const char *delta =
        "{\"updates\":[{\"values\":["
        "{\"path\":\"navigation.position\",\"value\":{\"latitude\":55.9,\"longitude\":-4.3}},"
        "{\"path\":\"navigation.anchor.position\",\"value\":{\"latitude\":55.901,\"longitude\":-4.301}},"
        "{\"path\":\"navigation.anchor.maxRadius\",\"value\":50},"
        "{\"path\":\"navigation.anchor.warningRadius\",\"value\":40},"
        "{\"path\":\"navigation.anchor.currentRadius\",\"value\":42},"
        "{\"path\":\"environment.wind.angleTrueWater\",\"value\":-0.4},"
        "{\"path\":\"environment.wind.directionTrue\",\"value\":1.2},"
        "{\"path\":\"notifications.navigation.anchor\","
        "\"value\":{\"state\":\"warn\",\"message\":\"Near boundary\"}}]}]}";
    telemetry_state_init();
    assert(signalk_delta_apply(delta, strlen(delta), 1000) == 8);
    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    assert(state.anchor_position_valid);
    assert(state.anchor_max_radius_m.valid);
    assert(state.true_wind_angle_rad.valid);
    assert(fabs(state.true_wind_angle_rad.value + 0.4) < 0.0001);
    assert(state.anchor_warning_radius_m.valid);
    assert(state.anchor_current_radius_m.valid);
    assert(state.true_wind_direction_rad.valid);
    assert(state.anchor_notification.valid);
    assert(state.anchor_notification.state == TELEMETRY_ANCHOR_NOTIFICATION_WARNING);
    assert(strcmp(state.anchor_notification.message, "Near boundary") == 0);

    const char *clear =
        "{\"updates\":[{\"values\":["
        "{\"path\":\"navigation.position\",\"value\":null},"
        "{\"path\":\"navigation.anchor.position\",\"value\":null},"
        "{\"path\":\"navigation.anchor.maxRadius\",\"value\":null},"
        "{\"path\":\"notifications.navigation.anchor\",\"value\":null}]}]}";
    assert(signalk_delta_apply(clear, strlen(clear), 2000) == 4);
    telemetry_state_snapshot(&state);
    assert(!state.own_position_valid);
    assert(!state.anchor_position_valid);
    assert(!state.anchor_max_radius_m.valid);
    assert(!state.anchor_notification.valid);
}

static void test_simulator_leaf_coordinate_pairs(void)
{
    const char *delta =
        "{\"updates\":[{\"values\":["
        "{\"path\":\"navigation.position.latitude\",\"value\":55.90018},"
        "{\"path\":\"navigation.position.longitude\",\"value\":-4.3},"
        "{\"path\":\"navigation.anchor.position.latitude\",\"value\":55.9},"
        "{\"path\":\"navigation.anchor.position.longitude\",\"value\":-4.3}]}]}";
    telemetry_state_init();
    assert(signalk_delta_apply(delta, strlen(delta), 3000) == 4);
    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    assert(state.own_position_valid);
    assert(state.anchor_position_valid);
    assert(fabs(state.own_latitude_deg - 55.90018) < 0.000001);
    assert(fabs(state.anchor_longitude_deg - -4.3) < 0.000001);
    assert(state.own_position_updated_ms == 3000);
}

int main(void)
{
    test_valid_values_and_null();
    test_malformed_and_missing_values_are_ignored();
    test_position_object_marks_gps_live();
    test_self_and_moving_ais_contexts_are_separated();
    test_anchor_values_notification_and_nulls();
    test_simulator_leaf_coordinate_pairs();
    puts("signalk_delta_test: PASS");
    return 0;
}
