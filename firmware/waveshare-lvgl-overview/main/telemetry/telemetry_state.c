#include "telemetry_state.h"

#include <math.h>
#include <stddef.h>
#include <string.h>

#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
static SemaphoreHandle_t state_mutex;
#define STATE_LOCK() xSemaphoreTake(state_mutex, portMAX_DELAY)
#define STATE_UNLOCK() xSemaphoreGive(state_mutex)
#else
#define STATE_LOCK() ((void)0)
#define STATE_UNLOCK() ((void)0)
#endif

static telemetry_state_t state;

typedef struct {
    const char *path;
    size_t offset;
} path_binding_t;

#define NUMERIC_OFFSET(field) offsetof(telemetry_state_t, field)

static const path_binding_t bindings[] = {
    {"navigation.speedOverGround", NUMERIC_OFFSET(speed_over_ground_mps)},
    {"environment.depth.belowKeel", NUMERIC_OFFSET(depth_below_keel_m)},
    {"environment.depth.belowSurface", NUMERIC_OFFSET(depth_below_surface_m)},
    {"environment.wind.speedApparent", NUMERIC_OFFSET(apparent_wind_speed_mps)},
    {"environment.wind.speedTrue", NUMERIC_OFFSET(true_wind_speed_mps)},
    {"environment.wind.angleTrueWater", NUMERIC_OFFSET(true_wind_angle_rad)},
    {"environment.wind.directionTrue", NUMERIC_OFFSET(true_wind_direction_rad)},
    {"navigation.gnss.methodQuality", NUMERIC_OFFSET(gps_quality)},
    {"navigation.headingTrue", NUMERIC_OFFSET(heading_true_rad)},
    {"navigation.anchor.maxRadius", NUMERIC_OFFSET(anchor_max_radius_m)},
    {"navigation.anchor.warningRadius", NUMERIC_OFFSET(anchor_warning_radius_m)},
    {"navigation.anchor.currentRadius", NUMERIC_OFFSET(anchor_current_radius_m)},
    {"navigation.anchor.rodeLength", NUMERIC_OFFSET(anchor_rode_length_m)},
    {"tanks.freshWater.0.currentLevel", NUMERIC_OFFSET(fresh_water_level_ratio)},
    {"electrical.solar.0.panelPower", NUMERIC_OFFSET(solar_panel_power_w)},
    {"electrical.batteries.house.capacity.stateOfCharge", NUMERIC_OFFSET(house_battery_soc_ratio)},
    {"electrical.batteries.house.voltage", NUMERIC_OFFSET(house_battery_voltage_v)},
    {"electrical.batteries.house.current", NUMERIC_OFFSET(house_battery_current_a)},
    {"electrical.batteries.start.capacity.stateOfCharge", NUMERIC_OFFSET(start_battery_soc_ratio)},
    {"electrical.batteries.start.voltage", NUMERIC_OFFSET(start_battery_voltage_v)},
    {"electrical.batteries.start.current", NUMERIC_OFFSET(start_battery_current_a)},
    /* Legacy test/boat installations may still expose the house bank as A. */
    {"electrical.batteries.A.capacity.stateOfCharge", NUMERIC_OFFSET(house_battery_soc_ratio)},
    {"electrical.batteries.A.voltage", NUMERIC_OFFSET(house_battery_voltage_v)},
    {"electrical.batteries.A.current", NUMERIC_OFFSET(house_battery_current_a)},
};

void telemetry_state_init(void)
{
    memset(&state, 0, sizeof(state));
#ifdef ESP_PLATFORM
    if (state_mutex == NULL) {
        state_mutex = xSemaphoreCreateMutex();
    }
#endif
}

void telemetry_state_set_wifi_rssi(int rssi_dbm)
{
    STATE_LOCK();
    state.wifi_rssi_dbm = rssi_dbm;
    STATE_UNLOCK();
}

void telemetry_state_note_delta(int64_t received_ms)
{
    STATE_LOCK();
    state.last_delta_ms = received_ms;
    STATE_UNLOCK();
}

void telemetry_state_set_self_context(const char *context)
{
    if (context == NULL || context[0] == '\0') {
        return;
    }
    STATE_LOCK();
    strncpy(state.self_context, context, sizeof(state.self_context) - 1);
    state.self_context[sizeof(state.self_context) - 1] = '\0';
    STATE_UNLOCK();
}

bool telemetry_state_context_is_self(const char *context)
{
    if (context == NULL) {
        return false;
    }
    STATE_LOCK();
    if (state.self_context[0] == '\0' &&
        strncmp(context, "vessels.", 8) == 0) {
        strncpy(state.self_context, context, sizeof(state.self_context) - 1);
        state.self_context[sizeof(state.self_context) - 1] = '\0';
    }
    bool is_self = strcmp(context, "vessels.self") == 0 ||
                   (state.self_context[0] != '\0' &&
                    strcmp(context, state.self_context) == 0);
    STATE_UNLOCK();
    return is_self;
}

static telemetry_ais_target_t *find_or_create_target(const char *context)
{
    telemetry_ais_target_t *free_target = NULL;
    for (size_t index = 0; index < TELEMETRY_MAX_AIS_TARGETS; index++) {
        telemetry_ais_target_t *target = &state.ais_targets[index];
        if (target->used && strcmp(target->context, context) == 0) {
            return target;
        }
        if (!target->used && free_target == NULL) {
            free_target = target;
        }
    }
    if (free_target != NULL) {
        free_target->used = true;
        strncpy(free_target->context, context,
                sizeof(free_target->context) - 1);
        free_target->context[sizeof(free_target->context) - 1] = '\0';
    }
    return free_target;
}

void telemetry_state_update_position(const char *context, double latitude_deg,
                                     double longitude_deg, int64_t updated_ms)
{
    if (context == NULL || !isfinite(latitude_deg) || !isfinite(longitude_deg)) {
        return;
    }
    STATE_LOCK();
    bool is_self = strcmp(context, "vessels.self") == 0 ||
                   (state.self_context[0] != '\0' &&
                    strcmp(context, state.self_context) == 0);
    if (is_self) {
        state.own_position_valid = true;
        state.own_latitude = (telemetry_numeric_t){true, latitude_deg, updated_ms};
        state.own_longitude = (telemetry_numeric_t){true, longitude_deg, updated_ms};
        state.own_latitude_deg = latitude_deg;
        state.own_longitude_deg = longitude_deg;
        state.own_position_updated_ms = updated_ms;
    } else {
        telemetry_ais_target_t *target = find_or_create_target(context);
        if (target != NULL) {
            target->position_valid = true;
            target->latitude_deg = latitude_deg;
            target->longitude_deg = longitude_deg;
            target->position_updated_ms = updated_ms;
        }
    }
    STATE_UNLOCK();
}

void telemetry_state_invalidate_position(const char *context, int64_t updated_ms)
{
    if (context == NULL) {
        return;
    }
    STATE_LOCK();
    bool is_self = strcmp(context, "vessels.self") == 0 ||
                   (state.self_context[0] != '\0' &&
                    strcmp(context, state.self_context) == 0);
    if (is_self) {
        state.own_position_valid = false;
        state.own_position_updated_ms = updated_ms;
    }
    STATE_UNLOCK();
}

void telemetry_state_update_anchor_position(double latitude_deg, double longitude_deg,
                                            bool valid, int64_t updated_ms)
{
    STATE_LOCK();
    state.anchor_position_valid = valid && isfinite(latitude_deg) &&
                                  isfinite(longitude_deg);
    if (state.anchor_position_valid) {
        state.anchor_latitude = (telemetry_numeric_t){true, latitude_deg, updated_ms};
        state.anchor_longitude = (telemetry_numeric_t){true, longitude_deg, updated_ms};
        state.anchor_latitude_deg = latitude_deg;
        state.anchor_longitude_deg = longitude_deg;
    }
    if (!valid) {
        state.anchor_latitude.valid = false;
        state.anchor_longitude.valid = false;
    }
    state.anchor_position_updated_ms = updated_ms;
    STATE_UNLOCK();
}

void telemetry_state_update_anchor_notification(
    telemetry_anchor_notification_state_t notification_state,
    const char *message, bool valid, int64_t updated_ms)
{
    STATE_LOCK();
    state.anchor_notification.valid = valid;
    state.anchor_notification.state = valid ? notification_state
                                             : TELEMETRY_ANCHOR_NOTIFICATION_NONE;
    state.anchor_notification.updated_ms = updated_ms;
    state.anchor_notification.message[0] = '\0';
    if (valid && message != NULL) {
        strncpy(state.anchor_notification.message, message,
                sizeof(state.anchor_notification.message) - 1);
        state.anchor_notification.message[
            sizeof(state.anchor_notification.message) - 1] = '\0';
    }
    STATE_UNLOCK();
}

void telemetry_state_update_ais_speed(const char *context, double speed_mps,
                                      bool numeric, int64_t updated_ms)
{
    if (context == NULL) {
        return;
    }
    STATE_LOCK();
    telemetry_ais_target_t *target = find_or_create_target(context);
    if (target != NULL) {
        target->speed_over_ground_mps.valid = numeric && isfinite(speed_mps);
        target->speed_over_ground_mps.value =
            target->speed_over_ground_mps.valid ? speed_mps : 0.0;
        target->speed_over_ground_mps.updated_ms = updated_ms;
    }
    STATE_UNLOCK();
}

bool telemetry_state_update_path(const char *path, double value, bool numeric,
                                 int64_t updated_ms)
{
    if (path == NULL) {
        return false;
    }

    telemetry_numeric_t *coordinate = NULL;
    bool own_coordinate = false;
    if (strcmp(path, "navigation.position.latitude") == 0) {
        coordinate = &state.own_latitude;
        own_coordinate = true;
    } else if (strcmp(path, "navigation.position.longitude") == 0) {
        coordinate = &state.own_longitude;
        own_coordinate = true;
    } else if (strcmp(path, "navigation.anchor.position.latitude") == 0) {
        coordinate = &state.anchor_latitude;
    } else if (strcmp(path, "navigation.anchor.position.longitude") == 0) {
        coordinate = &state.anchor_longitude;
    }
    if (coordinate != NULL) {
        STATE_LOCK();
        coordinate->valid = numeric && isfinite(value);
        coordinate->value = coordinate->valid ? value : 0.0;
        coordinate->updated_ms = updated_ms;
        if (own_coordinate) {
            state.own_position_valid = state.own_latitude.valid && state.own_longitude.valid;
            if (state.own_position_valid) {
                state.own_latitude_deg = state.own_latitude.value;
                state.own_longitude_deg = state.own_longitude.value;
                state.own_position_updated_ms =
                    state.own_latitude.updated_ms < state.own_longitude.updated_ms
                        ? state.own_latitude.updated_ms : state.own_longitude.updated_ms;
            }
        } else {
            state.anchor_position_valid = state.anchor_latitude.valid &&
                                          state.anchor_longitude.valid;
            if (state.anchor_position_valid) {
                state.anchor_latitude_deg = state.anchor_latitude.value;
                state.anchor_longitude_deg = state.anchor_longitude.value;
                state.anchor_position_updated_ms =
                    state.anchor_latitude.updated_ms < state.anchor_longitude.updated_ms
                        ? state.anchor_latitude.updated_ms : state.anchor_longitude.updated_ms;
            }
        }
        STATE_UNLOCK();
        return true;
    }

    for (size_t index = 0; index < sizeof(bindings) / sizeof(bindings[0]); index++) {
        if (strcmp(path, bindings[index].path) != 0) {
            continue;
        }

        STATE_LOCK();
        telemetry_numeric_t *target =
            (telemetry_numeric_t *)((uint8_t *)&state + bindings[index].offset);
        target->valid = numeric && isfinite(value);
        target->value = target->valid ? value : 0.0;
        target->updated_ms = updated_ms;
        STATE_UNLOCK();
        return true;
    }
    return false;
}

void telemetry_state_set_connections(bool wifi_connected, bool signalk_connected)
{
    STATE_LOCK();
    state.wifi_connected = wifi_connected;
    state.signalk_connected = signalk_connected;
    STATE_UNLOCK();
}

void telemetry_state_set_clock(int64_t epoch_ms, int64_t received_ms)
{
    STATE_LOCK();
    state.signalk_clock.valid = epoch_ms > 0;
    state.signalk_clock.epoch_ms = epoch_ms;
    state.signalk_clock.received_ms = received_ms;
    STATE_UNLOCK();
}

void telemetry_state_snapshot(telemetry_state_t *snapshot)
{
    if (snapshot == NULL) {
        return;
    }
    STATE_LOCK();
    *snapshot = state;
    STATE_UNLOCK();
}

telemetry_quality_t telemetry_numeric_quality(const telemetry_numeric_t *value,
                                              int64_t now_ms,
                                              int64_t stale_after_ms)
{
    if (value == NULL || !value->valid) {
        return TELEMETRY_QUALITY_UNAVAILABLE;
    }
    if (now_ms < value->updated_ms || now_ms - value->updated_ms > stale_after_ms) {
        return TELEMETRY_QUALITY_STALE;
    }
    return TELEMETRY_QUALITY_LIVE;
}

static bool valid_position(double latitude, double longitude)
{
    return isfinite(latitude) && isfinite(longitude) && latitude >= -90.0 &&
           latitude <= 90.0 && longitude >= -180.0 && longitude <= 180.0;
}

telemetry_anchor_status_t telemetry_anchor_status(const telemetry_state_t *snapshot,
                                                  int64_t now_ms,
                                                  int64_t gps_stale_after_ms,
                                                  const char **reason)
{
#define RETURN_STATUS(value, text) do { if (reason != NULL) *reason = text; return value; } while (0)
    if (snapshot == NULL) {
        RETURN_STATUS(TELEMETRY_ANCHOR_FAULT, "Telemetry model unavailable");
    }
    if ((snapshot->anchor_position_valid &&
         !valid_position(snapshot->anchor_latitude_deg, snapshot->anchor_longitude_deg)) ||
        (snapshot->anchor_max_radius_m.valid &&
         (!isfinite(snapshot->anchor_max_radius_m.value) ||
          snapshot->anchor_max_radius_m.value < 0.0)) ||
        (snapshot->anchor_warning_radius_m.valid &&
         (!isfinite(snapshot->anchor_warning_radius_m.value) ||
          snapshot->anchor_warning_radius_m.value < 0.0))) {
        RETURN_STATUS(TELEMETRY_ANCHOR_FAULT, "Invalid anchor configuration");
    }
    if (!snapshot->anchor_position_valid || !snapshot->anchor_max_radius_m.valid ||
        snapshot->anchor_max_radius_m.value <= 0.0) {
        RETURN_STATUS(TELEMETRY_ANCHOR_INACTIVE, "Anchor position or radius not set");
    }
    if (snapshot->anchor_notification.valid &&
        (snapshot->anchor_notification.state == TELEMETRY_ANCHOR_NOTIFICATION_ALARM ||
         snapshot->anchor_notification.state == TELEMETRY_ANCHOR_NOTIFICATION_EMERGENCY)) {
        RETURN_STATUS(TELEMETRY_ANCHOR_CRITICAL, "Anchor alarm notification");
    }
    if (!snapshot->own_position_valid ||
        !valid_position(snapshot->own_latitude_deg, snapshot->own_longitude_deg)) {
        RETURN_STATUS(TELEMETRY_ANCHOR_UNAVAILABLE, "Current GPS position unavailable");
    }
    if (now_ms < snapshot->own_position_updated_ms ||
        now_ms - snapshot->own_position_updated_ms > gps_stale_after_ms) {
        RETURN_STATUS(TELEMETRY_ANCHOR_STALE, "Current GPS position is stale");
    }
    if (!snapshot->anchor_current_radius_m.valid ||
        !isfinite(snapshot->anchor_current_radius_m.value) ||
        snapshot->anchor_current_radius_m.value < 0.0) {
        RETURN_STATUS(TELEMETRY_ANCHOR_UNAVAILABLE, "Current anchor distance unavailable");
    }
    if ((snapshot->anchor_notification.valid &&
         snapshot->anchor_notification.state == TELEMETRY_ANCHOR_NOTIFICATION_WARNING) ||
        (snapshot->anchor_warning_radius_m.valid &&
         snapshot->anchor_current_radius_m.value >= snapshot->anchor_warning_radius_m.value)) {
        RETURN_STATUS(TELEMETRY_ANCHOR_WARNING, "Approaching configured radius");
    }
    if (snapshot->anchor_current_radius_m.value >= snapshot->anchor_max_radius_m.value) {
        RETURN_STATUS(TELEMETRY_ANCHOR_CRITICAL, "Outside configured radius");
    }
    RETURN_STATUS(TELEMETRY_ANCHOR_WITHIN, "Within configured radius");
#undef RETURN_STATUS
}
