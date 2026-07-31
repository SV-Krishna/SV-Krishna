#include <assert.h>
#include <math.h>
#include <stdio.h>

#include "telemetry/telemetry_state.h"

static void test_known_path_and_snapshot(void)
{
    telemetry_state_init();
    assert(telemetry_state_update_path("navigation.speedOverGround", 3.5, true, 1000));
    assert(telemetry_state_update_path("environment.depth.belowSurface", 8.2, true, 1100));
    assert(!telemetry_state_update_path("navigation.notARealPath", 99.0, true, 1200));

    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    assert(state.speed_over_ground_mps.valid);
    assert(fabs(state.speed_over_ground_mps.value - 3.5) < 0.0001);
    assert(state.depth_below_surface_m.valid);
    assert(fabs(state.depth_below_surface_m.value - 8.2) < 0.0001);
}

static void test_null_and_non_finite_are_unavailable(void)
{
    telemetry_state_init();
    assert(telemetry_state_update_path("environment.wind.speedTrue", 4.0, true, 1000));
    assert(telemetry_state_update_path("environment.wind.speedTrue", 0.0, false, 2000));
    assert(telemetry_state_update_path("electrical.batteries.A.voltage",
                                       NAN, true, 2000));

    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    assert(!state.true_wind_speed_mps.valid);
    assert(!state.house_battery_voltage_v.valid);
}

static void test_quality_boundaries(void)
{
    telemetry_numeric_t unavailable = {0};
    telemetry_numeric_t value = {.valid = true, .value = 1.0, .updated_ms = 1000};

    assert(telemetry_numeric_quality(&unavailable, 2000, 3000) ==
           TELEMETRY_QUALITY_UNAVAILABLE);
    assert(telemetry_numeric_quality(&value, 4000, 3000) ==
           TELEMETRY_QUALITY_LIVE);
    assert(telemetry_numeric_quality(&value, 4001, 3000) ==
           TELEMETRY_QUALITY_STALE);
    assert(telemetry_numeric_quality(&value, 999, 3000) ==
           TELEMETRY_QUALITY_STALE);
}

static void test_connection_snapshot(void)
{
    telemetry_state_init();
    telemetry_state_set_connections(true, false);
    telemetry_state_set_wifi_rssi(-62);
    telemetry_state_note_delta(1500);
    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    assert(state.wifi_connected);
    assert(!state.signalk_connected);
    assert(state.wifi_rssi_dbm == -62);
    assert(state.last_delta_ms == 1500);
}

static void test_house_start_and_clock(void)
{
    telemetry_state_init();
    assert(telemetry_state_update_path("electrical.batteries.house.voltage",
                                       12.8, true, 1000));
    assert(telemetry_state_update_path("electrical.batteries.start.voltage",
                                       12.7, true, 1000));
    assert(telemetry_state_update_path("navigation.gnss.methodQuality",
                                       1.0, true, 1000));
    assert(telemetry_state_update_path("navigation.headingTrue",
                                       1.5, true, 1000));
    assert(telemetry_state_update_path("environment.wind.angleTrueWater",
                                       -0.7, true, 1000));
    assert(telemetry_state_update_path("tanks.freshWater.0.currentLevel",
                                       0.72, true, 1000));
    assert(telemetry_state_update_path("electrical.solar.0.panelPower",
                                       285.0, true, 1000));
    telemetry_state_set_clock(1785442482961, 2000);

    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    assert(state.house_battery_voltage_v.valid);
    assert(state.start_battery_voltage_v.valid);
    assert(state.gps_quality.valid);
    assert(fabs(state.heading_true_rad.value - 1.5) < 0.0001);
    assert(fabs(state.true_wind_angle_rad.value + 0.7) < 0.0001);
    assert(fabs(state.fresh_water_level_ratio.value - 0.72) < 0.0001);
    assert(fabs(state.solar_panel_power_w.value - 285.0) < 0.0001);
    assert(state.signalk_clock.valid);
    assert(state.signalk_clock.epoch_ms == 1785442482961);
}

static telemetry_state_t active_anchor_state(void)
{
    telemetry_state_t state = {0};
    state.anchor_position_valid = true;
    state.anchor_latitude_deg = 55.9;
    state.anchor_longitude_deg = -4.3;
    state.anchor_max_radius_m = (telemetry_numeric_t){true, 50.0, 1000};
    state.anchor_warning_radius_m = (telemetry_numeric_t){true, 40.0, 1000};
    state.anchor_current_radius_m = (telemetry_numeric_t){true, 20.0, 2000};
    state.own_position_valid = true;
    state.own_latitude_deg = 55.9001;
    state.own_longitude_deg = -4.3001;
    state.own_position_updated_ms = 2000;
    return state;
}

static void test_anchor_status_precedence(void)
{
    const char *reason = NULL;
    telemetry_state_t state = {0};
    assert(telemetry_anchor_status(&state, 2000, 5000, &reason) ==
           TELEMETRY_ANCHOR_INACTIVE);

    state = active_anchor_state();
    assert(telemetry_anchor_status(&state, 3000, 5000, &reason) ==
           TELEMETRY_ANCHOR_WITHIN);
    state.anchor_current_radius_m.value = 40.0;
    assert(telemetry_anchor_status(&state, 3000, 5000, &reason) ==
           TELEMETRY_ANCHOR_WARNING);
    state.anchor_current_radius_m.value = 51.0;
    assert(telemetry_anchor_status(&state, 3000, 5000, &reason) ==
           TELEMETRY_ANCHOR_WARNING);
    state.anchor_warning_radius_m.valid = false;
    assert(telemetry_anchor_status(&state, 3000, 5000, &reason) ==
           TELEMETRY_ANCHOR_CRITICAL);

    state = active_anchor_state();
    state.own_position_updated_ms = 1000;
    assert(telemetry_anchor_status(&state, 6001, 5000, &reason) ==
           TELEMETRY_ANCHOR_STALE);
    state.anchor_notification = (telemetry_anchor_notification_t){
        .valid = true, .state = TELEMETRY_ANCHOR_NOTIFICATION_ALARM};
    assert(telemetry_anchor_status(&state, 6001, 5000, &reason) ==
           TELEMETRY_ANCHOR_CRITICAL);

    state = active_anchor_state();
    state.own_position_valid = false;
    assert(telemetry_anchor_status(&state, 3000, 5000, &reason) ==
           TELEMETRY_ANCHOR_UNAVAILABLE);
    state = active_anchor_state();
    state.anchor_latitude_deg = 91.0;
    assert(telemetry_anchor_status(&state, 3000, 5000, &reason) ==
           TELEMETRY_ANCHOR_FAULT);
}

int main(void)
{
    test_known_path_and_snapshot();
    test_null_and_non_finite_are_unavailable();
    test_quality_boundaries();
    test_connection_snapshot();
    test_house_start_and_clock();
    test_anchor_status_precedence();
    puts("telemetry_state_test: PASS");
    return 0;
}
