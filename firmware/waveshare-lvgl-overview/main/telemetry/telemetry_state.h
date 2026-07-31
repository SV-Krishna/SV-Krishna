#pragma once

#include <stdbool.h>
#include <stdint.h>

#define TELEMETRY_MAX_AIS_TARGETS 8

typedef struct {
    bool valid;
    double value;
    int64_t updated_ms;
} telemetry_numeric_t;

typedef struct {
    bool valid;
    int64_t epoch_ms;
    int64_t received_ms;
} telemetry_clock_t;

typedef enum {
    TELEMETRY_ANCHOR_NOTIFICATION_NONE,
    TELEMETRY_ANCHOR_NOTIFICATION_NORMAL,
    TELEMETRY_ANCHOR_NOTIFICATION_WARNING,
    TELEMETRY_ANCHOR_NOTIFICATION_ALARM,
    TELEMETRY_ANCHOR_NOTIFICATION_EMERGENCY,
    TELEMETRY_ANCHOR_NOTIFICATION_UNKNOWN,
} telemetry_anchor_notification_state_t;

typedef struct {
    bool valid;
    telemetry_anchor_notification_state_t state;
    char message[96];
    int64_t updated_ms;
} telemetry_anchor_notification_t;

typedef struct {
    bool used;
    char context[96];
    bool position_valid;
    double latitude_deg;
    double longitude_deg;
    int64_t position_updated_ms;
    telemetry_numeric_t speed_over_ground_mps;
} telemetry_ais_target_t;

typedef struct {
    telemetry_numeric_t speed_over_ground_mps;
    telemetry_numeric_t depth_below_keel_m;
    telemetry_numeric_t depth_below_surface_m;
    telemetry_numeric_t apparent_wind_speed_mps;
    telemetry_numeric_t true_wind_speed_mps;
    telemetry_numeric_t house_battery_soc_ratio;
    telemetry_numeric_t house_battery_voltage_v;
    telemetry_numeric_t house_battery_current_a;
    telemetry_numeric_t start_battery_soc_ratio;
    telemetry_numeric_t start_battery_voltage_v;
    telemetry_numeric_t start_battery_current_a;
    telemetry_numeric_t gps_quality;
    telemetry_numeric_t heading_true_rad;
    telemetry_numeric_t true_wind_angle_rad;
    telemetry_numeric_t true_wind_direction_rad;
    telemetry_numeric_t anchor_max_radius_m;
    telemetry_numeric_t anchor_warning_radius_m;
    telemetry_numeric_t anchor_current_radius_m;
    telemetry_numeric_t anchor_rode_length_m;
    telemetry_numeric_t fresh_water_level_ratio;
    telemetry_numeric_t solar_panel_power_w;
    bool own_position_valid;
    telemetry_numeric_t own_latitude;
    telemetry_numeric_t own_longitude;
    double own_latitude_deg;
    double own_longitude_deg;
    int64_t own_position_updated_ms;
    bool anchor_position_valid;
    telemetry_numeric_t anchor_latitude;
    telemetry_numeric_t anchor_longitude;
    double anchor_latitude_deg;
    double anchor_longitude_deg;
    int64_t anchor_position_updated_ms;
    telemetry_anchor_notification_t anchor_notification;
    char self_context[96];
    telemetry_ais_target_t ais_targets[TELEMETRY_MAX_AIS_TARGETS];
    telemetry_clock_t signalk_clock;
    bool wifi_connected;
    bool signalk_connected;
    int wifi_rssi_dbm;
    int64_t last_delta_ms;
} telemetry_state_t;

typedef enum {
    TELEMETRY_QUALITY_UNAVAILABLE,
    TELEMETRY_QUALITY_LIVE,
    TELEMETRY_QUALITY_STALE,
} telemetry_quality_t;

typedef enum {
    TELEMETRY_ANCHOR_INACTIVE,
    TELEMETRY_ANCHOR_WITHIN,
    TELEMETRY_ANCHOR_WARNING,
    TELEMETRY_ANCHOR_CRITICAL,
    TELEMETRY_ANCHOR_STALE,
    TELEMETRY_ANCHOR_UNAVAILABLE,
    TELEMETRY_ANCHOR_FAULT,
} telemetry_anchor_status_t;

void telemetry_state_init(void);
bool telemetry_state_update_path(const char *path, double value, bool numeric,
                                 int64_t updated_ms);
void telemetry_state_set_connections(bool wifi_connected, bool signalk_connected);
void telemetry_state_set_wifi_rssi(int rssi_dbm);
void telemetry_state_note_delta(int64_t received_ms);
void telemetry_state_set_self_context(const char *context);
bool telemetry_state_context_is_self(const char *context);
void telemetry_state_update_position(const char *context, double latitude_deg,
                                     double longitude_deg, int64_t updated_ms);
void telemetry_state_invalidate_position(const char *context, int64_t updated_ms);
void telemetry_state_update_anchor_position(double latitude_deg, double longitude_deg,
                                            bool valid, int64_t updated_ms);
void telemetry_state_update_anchor_notification(
    telemetry_anchor_notification_state_t notification_state,
    const char *message, bool valid, int64_t updated_ms);
void telemetry_state_update_ais_speed(const char *context, double speed_mps,
                                      bool numeric, int64_t updated_ms);
void telemetry_state_set_clock(int64_t epoch_ms, int64_t received_ms);
void telemetry_state_snapshot(telemetry_state_t *snapshot);
telemetry_quality_t telemetry_numeric_quality(const telemetry_numeric_t *value,
                                              int64_t now_ms,
                                              int64_t stale_after_ms);
telemetry_anchor_status_t telemetry_anchor_status(const telemetry_state_t *snapshot,
                                                  int64_t now_ms,
                                                  int64_t gps_stale_after_ms,
                                                  const char **reason);
