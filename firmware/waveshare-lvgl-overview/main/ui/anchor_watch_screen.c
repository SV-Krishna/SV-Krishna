#include "anchor_watch_screen.h"

#include <math.h>
#include <stdio.h>
#include <time.h>

#include "esp_timer.h"
#include "lvgl.h"
#include "overview_screen.h"
#include "telemetry/telemetry_state.h"

#define SCREEN_W 800
#define SCREEN_H 480
#define TOP_H 40
#define NAV_H 54
#define PLOT_SIZE 354
#define PLOT_CENTER 177
#define TRAIL_POINTS 24
#define COMPASS_TICKS 12
#define CARDINAL_POINTS 4
#define WIND_SECTOR_DOTS 9
#define EARTH_RADIUS_M 6371000.0

static const lv_color_t COLOR_BG = LV_COLOR_MAKE(5, 14, 25);
static const lv_color_t COLOR_PANEL = LV_COLOR_MAKE(11, 27, 43);
static const lv_color_t COLOR_PANEL_2 = LV_COLOR_MAKE(15, 36, 56);
static const lv_color_t COLOR_BORDER = LV_COLOR_MAKE(31, 58, 78);
static const lv_color_t COLOR_TEXT = LV_COLOR_MAKE(235, 245, 250);
static const lv_color_t COLOR_MUTED = LV_COLOR_MAKE(130, 154, 170);
static const lv_color_t COLOR_CYAN = LV_COLOR_MAKE(31, 190, 220);
static const lv_color_t COLOR_BLUE = LV_COLOR_MAKE(43, 123, 238);
static const lv_color_t COLOR_GREEN = LV_COLOR_MAKE(43, 201, 132);
static const lv_color_t COLOR_AMBER = LV_COLOR_MAKE(245, 173, 59);
static const lv_color_t COLOR_RED = LV_COLOR_MAKE(239, 83, 80);

typedef struct {
    double east_m;
    double north_m;
} trail_point_t;

static lv_obj_t *anchor_screen;
static lv_obj_t *wifi_status_label;
static lv_obj_t *wifi_strength_parts[4];
static lv_obj_t *signalk_status_label;
static lv_obj_t *signalk_status_icon;
static lv_obj_t *gps_status_label;
static lv_obj_t *gps_status_icon;
static lv_obj_t *clock_label;
static lv_obj_t *status_panel;
static lv_obj_t *status_label;
static lv_obj_t *reason_label;
static lv_obj_t *gps_label;
static lv_obj_t *distance_label;
static lv_obj_t *bearing_label;
static lv_obj_t *heading_label;
static lv_obj_t *wind_label;
static lv_obj_t *wind_detail_label;
static lv_obj_t *radius_label;
static lv_obj_t *compass_ring;
static lv_obj_t *wind_sector_dots[WIND_SECTOR_DOTS];
static lv_obj_t *compass_ticks[COMPASS_TICKS];
static lv_point_t compass_tick_points[COMPASS_TICKS][2];
static lv_obj_t *cardinal_labels[CARDINAL_POINTS];
static lv_obj_t *plot_boundary;
static lv_obj_t *warning_boundary;
static lv_obj_t *boat_marker;
static lv_obj_t *anchor_marker;
static lv_obj_t *ais_markers[TELEMETRY_MAX_AIS_TARGETS];
static lv_obj_t *ais_label;
static lv_obj_t *rode_line;
static lv_point_t rode_points[2];
static lv_obj_t *trail_markers[TRAIL_POINTS];
static trail_point_t trail[TRAIL_POINTS];
static size_t trail_count;
static int64_t last_trail_fix_ms;

static void no_scroll(lv_obj_t *obj)
{
    lv_obj_clear_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_scrollbar_mode(obj, LV_SCROLLBAR_MODE_OFF);
}

static lv_obj_t *label_at(lv_obj_t *parent, const char *text,
                          const lv_font_t *font, lv_color_t color,
                          lv_coord_t x, lv_coord_t y)
{
    lv_obj_t *label = lv_label_create(parent);
    lv_label_set_text(label, text);
    lv_obj_set_style_text_font(label, font, 0);
    lv_obj_set_style_text_color(label, color, 0);
    lv_obj_set_pos(label, x, y);
    return label;
}

static lv_obj_t *panel_at(lv_obj_t *parent, lv_coord_t x, lv_coord_t y,
                          lv_coord_t w, lv_coord_t h)
{
    lv_obj_t *panel = lv_obj_create(parent);
    lv_obj_set_pos(panel, x, y);
    lv_obj_set_size(panel, w, h);
    lv_obj_set_style_bg_color(panel, COLOR_PANEL, 0);
    lv_obj_set_style_bg_opa(panel, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(panel, COLOR_BORDER, 0);
    lv_obj_set_style_border_width(panel, 1, 0);
    lv_obj_set_style_radius(panel, 10, 0);
    lv_obj_set_style_pad_all(panel, 0, 0);
    no_scroll(panel);
    return panel;
}

static lv_obj_t *metric_card(lv_obj_t *parent, lv_coord_t x, lv_coord_t y,
                             lv_coord_t height, const char *title,
                             const char *value, const char *unit,
                             const char *detail, lv_color_t accent,
                             lv_obj_t **value_out, lv_obj_t **detail_out)
{
    lv_obj_t *card = panel_at(parent, x, y, 206, height);
    lv_obj_t *marker = lv_obj_create(card);
    lv_obj_set_size(marker, 3, height - 24);
    lv_obj_set_pos(marker, 0, 12);
    lv_obj_set_style_bg_color(marker, accent, 0);
    lv_obj_set_style_bg_opa(marker, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(marker, 0, 0);
    lv_obj_set_style_radius(marker, 2, 0);
    lv_obj_set_style_pad_all(marker, 0, 0);
    no_scroll(marker);
    label_at(card, title, &lv_font_montserrat_12, COLOR_MUTED, 14, 10);
    lv_obj_t *value_label =
        label_at(card, value, &lv_font_montserrat_28, COLOR_TEXT, 14, 31);
    label_at(card, unit, &lv_font_montserrat_14, COLOR_MUTED, 104, 43);
    lv_obj_t *detail_label = label_at(card, detail, &lv_font_montserrat_12,
                                      accent, 14, height - 25);
    if (value_out != NULL) *value_out = value_label;
    if (detail_out != NULL) *detail_out = detail_label;
    return card;
}

static void status_pill(lv_obj_t *parent, lv_coord_t x, lv_coord_t width,
                        const char *symbol, const char *text, lv_color_t color,
                        lv_obj_t **pill_out, lv_obj_t **icon_out,
                        lv_obj_t **text_out)
{
    lv_obj_t *pill = lv_obj_create(parent);
    lv_obj_set_pos(pill, x, 7);
    lv_obj_set_size(pill, width, 27);
    lv_obj_set_style_radius(pill, 14, 0);
    lv_obj_set_style_bg_color(pill, COLOR_PANEL_2, 0);
    lv_obj_set_style_bg_opa(pill, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(pill, 0, 0);
    lv_obj_set_style_pad_all(pill, 0, 0);
    no_scroll(pill);
    lv_obj_t *icon_label =
        label_at(pill, symbol, &lv_font_montserrat_14, color, 9, 6);
    lv_obj_t *text_label =
        label_at(pill, text, &lv_font_montserrat_12, COLOR_TEXT, 30, 6);
    if (pill_out != NULL) *pill_out = pill;
    if (icon_out != NULL) *icon_out = icon_label;
    if (text_out != NULL) *text_out = text_label;
}

static void make_wifi_strength_icon(lv_obj_t *pill)
{
    wifi_strength_parts[0] = lv_obj_create(pill);
    lv_obj_set_size(wifi_strength_parts[0], 4, 4);
    lv_obj_set_pos(wifi_strength_parts[0], 17, 18);
    lv_obj_set_style_radius(wifi_strength_parts[0], LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(wifi_strength_parts[0], 0, 0);
    lv_obj_set_style_pad_all(wifi_strength_parts[0], 0, 0);
    no_scroll(wifi_strength_parts[0]);
    static const lv_coord_t sizes[] = {10, 16, 22};
    for (int index = 1; index < 4; index++) {
        lv_obj_t *arc = lv_arc_create(pill);
        wifi_strength_parts[index] = arc;
        lv_obj_set_size(arc, sizes[index - 1], sizes[index - 1]);
        lv_obj_set_pos(arc, 19 - sizes[index - 1] / 2,
                       20 - sizes[index - 1] / 2);
        lv_arc_set_bg_angles(arc, 225, 315);
        lv_arc_set_angles(arc, 225, 315);
        lv_obj_set_style_arc_width(arc, 2, LV_PART_INDICATOR);
        lv_obj_set_style_arc_opa(arc, LV_OPA_TRANSP, LV_PART_MAIN);
        lv_obj_remove_style(arc, NULL, LV_PART_KNOB);
        lv_obj_clear_flag(arc, LV_OBJ_FLAG_CLICKABLE);
    }
}

static lv_obj_t *make_anchor_marker(lv_obj_t *parent)
{
    static lv_point_t stem_points[] = {{14, 1}, {14, 23}};
    static lv_point_t stock_points[] = {{6, 8}, {22, 8}};
    static lv_point_t arms_points[] = {
        {2, 19}, {5, 25}, {10, 29}, {14, 30},
        {18, 29}, {23, 25}, {26, 19},
    };
    lv_obj_t *marker = lv_obj_create(parent);
    lv_obj_set_size(marker, 29, 32);
    lv_obj_set_style_bg_opa(marker, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(marker, 0, 0);
    lv_obj_set_style_pad_all(marker, 0, 0);
    no_scroll(marker);
    lv_obj_t *stem = lv_line_create(marker);
    lv_line_set_points(stem, stem_points, 2);
    lv_obj_set_style_line_width(stem, 3, 0);
    lv_obj_set_style_line_color(stem, COLOR_AMBER, 0);
    lv_obj_set_style_line_rounded(stem, true, 0);
    lv_obj_t *stock = lv_line_create(marker);
    lv_line_set_points(stock, stock_points, 2);
    lv_obj_set_style_line_width(stock, 3, 0);
    lv_obj_set_style_line_color(stock, COLOR_AMBER, 0);
    lv_obj_set_style_line_rounded(stock, true, 0);
    lv_obj_t *arms = lv_line_create(marker);
    lv_line_set_points(arms, arms_points,
                       sizeof(arms_points) / sizeof(arms_points[0]));
    lv_obj_set_style_line_width(arms, 3, 0);
    lv_obj_set_style_line_color(arms, COLOR_AMBER, 0);
    lv_obj_set_style_line_rounded(arms, true, 0);
    lv_obj_t *ring = lv_obj_create(marker);
    lv_obj_set_size(ring, 7, 7);
    lv_obj_set_pos(ring, 11, 0);
    lv_obj_set_style_radius(ring, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(ring, COLOR_PANEL, 0);
    lv_obj_set_style_bg_opa(ring, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(ring, 2, 0);
    lv_obj_set_style_border_color(ring, COLOR_AMBER, 0);
    lv_obj_set_style_pad_all(ring, 0, 0);
    no_scroll(ring);
    return marker;
}

static void show_overview(lv_event_t *event)
{
    (void)event;
    krishna_overview_show();
}

static void nav_button(lv_obj_t *parent, lv_coord_t x, const char *symbol,
                       const char *text, bool active, lv_event_cb_t callback)
{
    lv_obj_t *button = lv_btn_create(parent);
    lv_obj_set_pos(button, x, 4);
    lv_obj_set_size(button, 256, 46);
    lv_obj_set_style_radius(button, 8, 0);
    lv_obj_set_style_shadow_width(button, 0, 0);
    lv_obj_set_style_bg_color(button, active ? COLOR_BLUE : COLOR_PANEL, 0);
    lv_obj_set_style_border_width(button, active ? 0 : 1, 0);
    lv_obj_set_style_border_color(button, COLOR_BORDER, 0);
    lv_obj_set_style_pad_all(button, 0, 0);
    label_at(button, symbol, &lv_font_montserrat_20,
             active ? COLOR_TEXT : COLOR_MUTED, 55, 13);
    label_at(button, text, &lv_font_montserrat_14,
             active ? COLOR_TEXT : COLOR_MUTED, 84, 15);
    if (callback != NULL) lv_obj_add_event_cb(button, callback, LV_EVENT_CLICKED, NULL);
}

static void project_position(const telemetry_state_t *state, double *east_m,
                             double *north_m)
{
    double anchor_lat = state->anchor_latitude_deg * M_PI / 180.0;
    double vessel_lat = state->own_latitude_deg * M_PI / 180.0;
    double delta_lon = (state->own_longitude_deg - state->anchor_longitude_deg) *
                       M_PI / 180.0;
    if (delta_lon > M_PI) delta_lon -= 2.0 * M_PI;
    if (delta_lon < -M_PI) delta_lon += 2.0 * M_PI;
    *east_m = EARTH_RADIUS_M * delta_lon * cos((anchor_lat + vessel_lat) / 2.0);
    *north_m = EARTH_RADIUS_M * (vessel_lat - anchor_lat);
}

static void append_trail(double east_m, double north_m, int64_t fix_ms)
{
    if (fix_ms == last_trail_fix_ms) return;
    if (trail_count > 0 && hypot(east_m - trail[trail_count - 1].east_m,
                                 north_m - trail[trail_count - 1].north_m) < 0.25) {
        last_trail_fix_ms = fix_ms;
        return;
    }
    if (trail_count == TRAIL_POINTS) {
        for (size_t i = 1; i < TRAIL_POINTS; i++) trail[i - 1] = trail[i];
        trail_count--;
    }
    trail[trail_count++] = (trail_point_t){east_m, north_m};
    last_trail_fix_ms = fix_ms;
}

static const char *status_name(telemetry_anchor_status_t status)
{
    static const char *names[] = {"INACTIVE", "WITHIN", "WARNING", "CRITICAL",
                                  "STALE", "UNAVAILABLE", "FAULT"};
    return names[status];
}

static lv_color_t status_color(telemetry_anchor_status_t status)
{
    if (status == TELEMETRY_ANCHOR_WITHIN) return COLOR_GREEN;
    if (status == TELEMETRY_ANCHOR_WARNING || status == TELEMETRY_ANCHOR_STALE)
        return COLOR_AMBER;
    if (status == TELEMETRY_ANCHOR_CRITICAL || status == TELEMETRY_ANCHOR_FAULT)
        return COLOR_RED;
    return COLOR_MUTED;
}

static void update_instrument_ring(const telemetry_state_t *state)
{
    double heading = state->heading_true_rad.valid
                         ? state->heading_true_rad.value : 0.0;
    for (int index = 0; index < COMPASS_TICKS; index++) {
        double true_bearing = index * (2.0 * M_PI / COMPASS_TICKS);
        double relative = true_bearing - heading;
        double sine = sin(relative);
        double cosine = cos(relative);
        compass_tick_points[index][0] = (lv_point_t){
            PLOT_CENTER + (lv_coord_t)lround(sine * 161.0),
            PLOT_CENTER - (lv_coord_t)lround(cosine * 161.0)};
        compass_tick_points[index][1] = (lv_point_t){
            PLOT_CENTER + (lv_coord_t)lround(sine * 168.0),
            PLOT_CENTER - (lv_coord_t)lround(cosine * 168.0)};
        lv_line_set_points(compass_ticks[index], compass_tick_points[index], 2);
        lv_obj_invalidate(compass_ticks[index]);
    }
    for (int index = 0; index < CARDINAL_POINTS; index++) {
        double true_bearing = index * (M_PI / 2.0);
        double relative = true_bearing - heading;
        int x = PLOT_CENTER + (int)lround(sin(relative) * 149.0);
        int y = PLOT_CENTER - (int)lround(cos(relative) * 149.0);
        lv_obj_set_pos(cardinal_labels[index], x - 6, y - 8);
    }
    if (state->true_wind_angle_rad.valid) {
        for (int index = 0; index < WIND_SECTOR_DOTS; index++) {
            double offset = (index - WIND_SECTOR_DOTS / 2) * 4.0 * M_PI / 180.0;
            double relative = state->true_wind_angle_rad.value + offset;
            int size = index == WIND_SECTOR_DOTS / 2 ? 10 : 7;
            int x = PLOT_CENTER + (int)lround(sin(relative) * 166.0);
            int y = PLOT_CENTER - (int)lround(cos(relative) * 166.0);
            lv_obj_set_size(wind_sector_dots[index], size, size);
            lv_obj_set_pos(wind_sector_dots[index], x - size / 2, y - size / 2);
            lv_obj_clear_flag(wind_sector_dots[index], LV_OBJ_FLAG_HIDDEN);
            lv_obj_move_foreground(wind_sector_dots[index]);
        }
    } else {
        for (int index = 0; index < WIND_SECTOR_DOTS; index++)
            lv_obj_add_flag(wind_sector_dots[index], LV_OBJ_FLAG_HIDDEN);
    }
}

static void update_plot(const telemetry_state_t *state, bool gps_fresh)
{
    update_instrument_ring(state);
    bool geometry = state->anchor_position_valid && state->own_position_valid &&
                    state->anchor_max_radius_m.valid &&
                    state->anchor_max_radius_m.value > 0.0;
    if (!geometry) {
        lv_obj_add_flag(boat_marker, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(rode_line, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(warning_boundary, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(ais_label, "AIS  0");
        for (int i = 0; i < TELEMETRY_MAX_AIS_TARGETS; i++)
            lv_obj_add_flag(ais_markers[i], LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_size(plot_boundary, 250, 250);
        lv_obj_center(plot_boundary);
        return;
    }
    double east_m, north_m;
    project_position(state, &east_m, &north_m);
    if (gps_fresh) append_trail(east_m, north_m, state->own_position_updated_ms);
    double distance = hypot(east_m, north_m);
    double extent = fmax(state->anchor_max_radius_m.value, distance) * 1.15;
    if (extent < 10.0) extent = 10.0;
    double pixels_per_m = (PLOT_CENTER - 22.0) / extent;
    int boundary_size = (int)lround(2.0 * state->anchor_max_radius_m.value * pixels_per_m);
    boundary_size = LV_CLAMP(8, boundary_size, PLOT_SIZE - 24);
    lv_obj_set_size(plot_boundary, boundary_size, boundary_size);
    lv_obj_center(plot_boundary);
    if (state->anchor_warning_radius_m.valid && state->anchor_warning_radius_m.value > 0.0) {
        int size = (int)lround(2.0 * state->anchor_warning_radius_m.value * pixels_per_m);
        lv_obj_set_size(warning_boundary, LV_CLAMP(8, size, PLOT_SIZE - 24),
                        LV_CLAMP(8, size, PLOT_SIZE - 24));
        lv_obj_center(warning_boundary);
        lv_obj_clear_flag(warning_boundary, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(warning_boundary, LV_OBJ_FLAG_HIDDEN);
    }
    double heading = state->heading_true_rad.valid ? state->heading_true_rad.value : 0.0;
    double relative_east = east_m * cos(heading) - north_m * sin(heading);
    double relative_north = north_m * cos(heading) + east_m * sin(heading);
    int boat_x = PLOT_CENTER + (int)lround(relative_east * pixels_per_m);
    int boat_y = PLOT_CENTER - (int)lround(relative_north * pixels_per_m);
    boat_x = LV_CLAMP(14, boat_x, PLOT_SIZE - 14);
    boat_y = LV_CLAMP(14, boat_y, PLOT_SIZE - 14);
    lv_obj_set_pos(boat_marker, boat_x - 12, boat_y - 12);
    lv_obj_set_style_line_opa(boat_marker, gps_fresh ? LV_OPA_COVER : LV_OPA_50, 0);
    lv_obj_clear_flag(boat_marker, LV_OBJ_FLAG_HIDDEN);
    rode_points[0] = (lv_point_t){PLOT_CENTER, PLOT_CENTER};
    rode_points[1] = (lv_point_t){boat_x, boat_y};
    lv_line_set_points(rode_line, rode_points, 2);
    lv_obj_clear_flag(rode_line, LV_OBJ_FLAG_HIDDEN);
    for (size_t i = 0; i < TRAIL_POINTS; i++) {
        if (i >= trail_count) {
            lv_obj_add_flag(trail_markers[i], LV_OBJ_FLAG_HIDDEN);
            continue;
        }
        double trail_east = trail[i].east_m * cos(heading) -
                            trail[i].north_m * sin(heading);
        double trail_north = trail[i].north_m * cos(heading) +
                             trail[i].east_m * sin(heading);
        int x = PLOT_CENTER + (int)lround(trail_east * pixels_per_m);
        int y = PLOT_CENTER - (int)lround(trail_north * pixels_per_m);
        lv_obj_set_pos(trail_markers[i], LV_CLAMP(4, x - 2, PLOT_SIZE - 8),
                       LV_CLAMP(4, y - 2, PLOT_SIZE - 8));
        lv_obj_clear_flag(trail_markers[i], LV_OBJ_FLAG_HIDDEN);
    }
    int visible_ais = 0;
    double anchor_lat_rad = state->anchor_latitude_deg * M_PI / 180.0;
    for (int i = 0; i < TELEMETRY_MAX_AIS_TARGETS; i++) {
        lv_obj_add_flag(ais_markers[i], LV_OBJ_FLAG_HIDDEN);
        const telemetry_ais_target_t *target = &state->ais_targets[i];
        int64_t age_difference = state->own_position_updated_ms >= target->position_updated_ms
                                     ? state->own_position_updated_ms - target->position_updated_ms
                                     : target->position_updated_ms - state->own_position_updated_ms;
        bool fresh = target->position_valid && target->speed_over_ground_mps.valid &&
                     target->speed_over_ground_mps.value > 0.257222 &&
                     age_difference <= 15000;
        if (!fresh) continue;
        double target_lat_rad = target->latitude_deg * M_PI / 180.0;
        double delta_lon = (target->longitude_deg - state->anchor_longitude_deg) *
                           M_PI / 180.0;
        if (delta_lon > M_PI) delta_lon -= 2.0 * M_PI;
        if (delta_lon < -M_PI) delta_lon += 2.0 * M_PI;
        double target_east = EARTH_RADIUS_M * delta_lon *
                             cos((anchor_lat_rad + target_lat_rad) / 2.0);
        double target_north = EARTH_RADIUS_M * (target_lat_rad - anchor_lat_rad);
        if (hypot(target_east, target_north) > extent) continue;
        double relative_target_east = target_east * cos(heading) -
                                      target_north * sin(heading);
        double relative_target_north = target_north * cos(heading) +
                                       target_east * sin(heading);
        int x = PLOT_CENTER + (int)lround(relative_target_east * pixels_per_m);
        int y = PLOT_CENTER - (int)lround(relative_target_north * pixels_per_m);
        lv_obj_set_pos(ais_markers[i], LV_CLAMP(4, x - 4, PLOT_SIZE - 12),
                       LV_CLAMP(4, y - 4, PLOT_SIZE - 12));
        lv_obj_clear_flag(ais_markers[i], LV_OBJ_FLAG_HIDDEN);
        visible_ais++;
    }
    lv_label_set_text_fmt(ais_label, "AIS  %d", visible_ais);
}

static void telemetry_timer(lv_timer_t *timer)
{
    (void)timer;
    char value_text[64];
    telemetry_state_t state;
    telemetry_state_snapshot(&state);
    int64_t now_ms = esp_timer_get_time() / 1000;
    lv_label_set_text(wifi_status_label,
                      state.wifi_connected ? "Wi-Fi" : "Wi-Fi --");
    lv_color_t wifi_color = COLOR_MUTED;
    int wifi_bars = 0;
    if (state.wifi_connected) {
        wifi_bars = state.wifi_rssi_dbm >= -55 ? 4
                    : state.wifi_rssi_dbm >= -67 ? 3
                    : state.wifi_rssi_dbm >= -75 ? 2 : 1;
        wifi_color = state.wifi_rssi_dbm >= -67 ? COLOR_GREEN
                     : state.wifi_rssi_dbm >= -75 ? COLOR_AMBER : COLOR_MUTED;
    }
    lv_obj_set_style_text_color(wifi_status_label, wifi_color, 0);
    lv_obj_set_style_bg_color(wifi_strength_parts[0],
                              wifi_bars > 0 ? wifi_color : COLOR_BORDER, 0);
    lv_obj_set_style_bg_opa(wifi_strength_parts[0], LV_OPA_COVER, 0);
    for (int index = 1; index < 4; index++) {
        lv_obj_set_style_arc_color(wifi_strength_parts[index],
                                   index < wifi_bars ? wifi_color : COLOR_BORDER,
                                   LV_PART_INDICATOR);
    }
    bool signalk_fresh = state.signalk_connected && state.last_delta_ms > 0 &&
                         now_ms >= state.last_delta_ms &&
                         now_ms - state.last_delta_ms <= 5000;
    bool signalk_stale = state.signalk_connected && !signalk_fresh;
    lv_label_set_text(signalk_status_label,
                      signalk_fresh ? "SK LIVE"
                      : signalk_stale ? "SK STALE" : "SK --");
    lv_color_t signalk_color = signalk_fresh ? COLOR_GREEN
                                : signalk_stale ? COLOR_AMBER : COLOR_MUTED;
    lv_obj_set_style_text_color(signalk_status_label, signalk_color, 0);
    lv_obj_set_style_text_color(signalk_status_icon, signalk_color, 0);
    telemetry_quality_t top_gps_quality =
        telemetry_numeric_quality(&state.gps_quality, now_ms, 5000);
    lv_label_set_text(gps_status_label,
                      top_gps_quality == TELEMETRY_QUALITY_LIVE ? "GPS LIVE"
                      : top_gps_quality == TELEMETRY_QUALITY_STALE ? "GPS STALE"
                                                                   : "GPS --");
    lv_color_t top_gps_color = top_gps_quality == TELEMETRY_QUALITY_LIVE
                                   ? COLOR_GREEN
                               : top_gps_quality == TELEMETRY_QUALITY_STALE
                                   ? COLOR_AMBER : COLOR_MUTED;
    lv_obj_set_style_text_color(gps_status_label, top_gps_color, 0);
    lv_obj_set_style_text_color(gps_status_icon, top_gps_color, 0);
    if (state.signalk_clock.valid) {
        int64_t elapsed_ms = now_ms - state.signalk_clock.received_ms;
        time_t epoch_seconds =
            (time_t)((state.signalk_clock.epoch_ms + elapsed_ms) / 1000);
        struct tm local;
        if (localtime_r(&epoch_seconds, &local) != NULL) {
            lv_label_set_text_fmt(clock_label, "%02d:%02d", local.tm_hour,
                                  local.tm_min);
        }
    }
    const char *reason;
    telemetry_anchor_status_t status = telemetry_anchor_status(&state, now_ms, 5000, &reason);
    lv_color_t color = status_color(status);
    lv_label_set_text(status_label, status_name(status));
    lv_label_set_text(reason_label, state.anchor_notification.valid &&
                                   state.anchor_notification.message[0] != '\0'
                                   ? state.anchor_notification.message : reason);
    lv_obj_set_style_text_color(status_label, color, 0);
    lv_obj_set_style_border_color(status_panel, color, 0);
    bool gps_available = state.own_position_valid;
    int64_t gps_age = gps_available && now_ms >= state.own_position_updated_ms
                          ? now_ms - state.own_position_updated_ms : 0;
    if (gps_available) {
        snprintf(value_text, sizeof(value_text), "GPS AGE  %.1f s", gps_age / 1000.0);
        lv_label_set_text(gps_label, value_text);
    }
    else lv_label_set_text(gps_label, "GPS AGE  --");
    lv_obj_set_style_text_color(gps_label, gps_age > 5000 ? COLOR_AMBER :
                                           gps_available ? COLOR_GREEN : COLOR_MUTED, 0);
    if (state.anchor_current_radius_m.valid) {
        snprintf(value_text, sizeof(value_text), "%.1f", state.anchor_current_radius_m.value);
        lv_label_set_text(distance_label, value_text);
    }
    else lv_label_set_text(distance_label, "--");
    if (state.anchor_max_radius_m.valid) {
        snprintf(value_text, sizeof(value_text), "MAX %.0f m", state.anchor_max_radius_m.value);
        lv_label_set_text(radius_label, value_text);
    }
    else lv_label_set_text(radius_label, "MAX  -- m");
    if (state.anchor_position_valid && state.own_position_valid) {
        double east_m, north_m;
        project_position(&state, &east_m, &north_m);
        double bearing = atan2(east_m, north_m) * 180.0 / M_PI;
        if (bearing < 0.0) bearing += 360.0;
        snprintf(value_text, sizeof(value_text), "%03.0f", bearing);
        lv_label_set_text(bearing_label, value_text);
    } else lv_label_set_text(bearing_label, "---");
    if (state.heading_true_rad.valid) {
        snprintf(value_text, sizeof(value_text), "%03.0f",
                 fmod(state.heading_true_rad.value * 180.0 / M_PI + 360.0, 360.0));
        lv_label_set_text(heading_label, value_text);
    }
    else lv_label_set_text(heading_label, "---");
    if (state.true_wind_speed_mps.valid) {
        snprintf(value_text, sizeof(value_text), "%.1f",
                 state.true_wind_speed_mps.value * 1.943844);
        lv_label_set_text(wind_label, value_text);
    } else {
        lv_label_set_text(wind_label, "--");
    }
    if (state.true_wind_direction_rad.valid) {
        double direction = fmod(state.true_wind_direction_rad.value * 180.0 / M_PI + 360.0, 360.0);
        snprintf(value_text, sizeof(value_text), "%03.0f deg  TRUE", direction);
        lv_label_set_text(wind_detail_label, value_text);
    } else {
        lv_label_set_text(wind_detail_label, "DIRECTION --");
    }
    update_plot(&state, gps_available && gps_age <= 5000);
}

void krishna_anchor_watch_create(void)
{
    if (anchor_screen != NULL) return;
    anchor_screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(anchor_screen, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(anchor_screen, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(anchor_screen, 0, 0);
    no_scroll(anchor_screen);

    lv_obj_t *top = lv_obj_create(anchor_screen);
    lv_obj_set_size(top, SCREEN_W, TOP_H);
    lv_obj_set_style_bg_color(top, COLOR_PANEL, 0);
    lv_obj_set_style_bg_opa(top, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(top, 0, 0);
    lv_obj_set_style_pad_all(top, 0, 0);
    no_scroll(top);
    label_at(top, "KRISHNA", &lv_font_montserrat_20, COLOR_TEXT, 12, 9);
    label_at(top, "ANCHOR WATCH", &lv_font_montserrat_12, COLOR_CYAN, 116, 14);
    lv_obj_t *wifi_pill;
    status_pill(top, 244, 116, "", "Wi-Fi", COLOR_MUTED,
                &wifi_pill, NULL, &wifi_status_label);
    make_wifi_strength_icon(wifi_pill);
    status_pill(top, 368, 106, LV_SYMBOL_REFRESH, "SK --", COLOR_MUTED,
                NULL, &signalk_status_icon, &signalk_status_label);
    status_pill(top, 482, 106, LV_SYMBOL_GPS, "GPS --", COLOR_MUTED,
                NULL, &gps_status_icon, &gps_status_label);
    clock_label =
        label_at(top, "--:--", &lv_font_montserrat_20, COLOR_TEXT, 730, 9);

    lv_obj_t *plot = panel_at(anchor_screen, 8, 48, PLOT_SIZE, PLOT_SIZE);
    ais_label = label_at(plot, "AIS  0", &lv_font_montserrat_12, COLOR_AMBER, 12, 12);
    compass_ring = lv_obj_create(plot);
    lv_obj_set_size(compass_ring, 342, 342);
    lv_obj_center(compass_ring);
    lv_obj_set_style_bg_opa(compass_ring, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(compass_ring, 1, 0);
    lv_obj_set_style_border_color(compass_ring, COLOR_BORDER, 0);
    lv_obj_set_style_radius(compass_ring, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_pad_all(compass_ring, 0, 0);
    no_scroll(compass_ring);
    for (int index = 0; index < COMPASS_TICKS; index++) {
        compass_ticks[index] = lv_line_create(plot);
        lv_line_set_points(compass_ticks[index], compass_tick_points[index], 2);
        bool cardinal_tick = index % 3 == 0;
        lv_obj_set_style_line_width(compass_ticks[index], cardinal_tick ? 2 : 1, 0);
        lv_obj_set_style_line_color(compass_ticks[index],
                                    cardinal_tick ? COLOR_TEXT : COLOR_MUTED, 0);
    }
    static const char *cardinal_text[CARDINAL_POINTS] = {"N", "E", "S", "W"};
    for (int index = 0; index < CARDINAL_POINTS; index++) {
        cardinal_labels[index] = label_at(plot, cardinal_text[index],
                                           &lv_font_montserrat_12,
                                           index == 0 ? COLOR_TEXT : COLOR_MUTED,
                                           PLOT_CENTER - 6, PLOT_CENTER - 8);
    }
    for (int index = 0; index < WIND_SECTOR_DOTS; index++) {
        wind_sector_dots[index] = lv_obj_create(plot);
        lv_obj_set_size(wind_sector_dots[index], 7, 7);
        lv_obj_set_style_radius(wind_sector_dots[index], LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_color(wind_sector_dots[index], COLOR_CYAN, 0);
        lv_obj_set_style_bg_opa(wind_sector_dots[index], LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(wind_sector_dots[index], 0, 0);
        lv_obj_set_style_pad_all(wind_sector_dots[index], 0, 0);
        lv_obj_add_flag(wind_sector_dots[index], LV_OBJ_FLAG_HIDDEN);
        no_scroll(wind_sector_dots[index]);
    }
    plot_boundary = lv_obj_create(plot);
    lv_obj_set_style_bg_opa(plot_boundary, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(plot_boundary, 2, 0);
    lv_obj_set_style_border_color(plot_boundary, COLOR_RED, 0);
    lv_obj_set_style_radius(plot_boundary, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_pad_all(plot_boundary, 0, 0);
    no_scroll(plot_boundary);
    warning_boundary = lv_obj_create(plot);
    lv_obj_set_style_bg_opa(warning_boundary, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(warning_boundary, 1, 0);
    lv_obj_set_style_border_color(warning_boundary, COLOR_AMBER, 0);
    lv_obj_set_style_radius(warning_boundary, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_pad_all(warning_boundary, 0, 0);
    no_scroll(warning_boundary);
    rode_line = lv_line_create(plot);
    lv_obj_set_style_line_color(rode_line, COLOR_CYAN, 0);
    lv_obj_set_style_line_width(rode_line, 2, 0);
    for (size_t i = 0; i < TRAIL_POINTS; i++) {
        trail_markers[i] = lv_obj_create(plot);
        lv_obj_set_size(trail_markers[i], 5, 5);
        lv_obj_set_style_radius(trail_markers[i], LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_color(trail_markers[i], COLOR_BLUE, 0);
        lv_obj_set_style_border_width(trail_markers[i], 0, 0);
        lv_obj_add_flag(trail_markers[i], LV_OBJ_FLAG_HIDDEN);
    }
    for (int i = 0; i < TELEMETRY_MAX_AIS_TARGETS; i++) {
        ais_markers[i] = lv_obj_create(plot);
        lv_obj_set_size(ais_markers[i], 8, 8);
        lv_obj_set_style_radius(ais_markers[i], LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_color(ais_markers[i], COLOR_AMBER, 0);
        lv_obj_set_style_bg_opa(ais_markers[i], LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(ais_markers[i], 0, 0);
        lv_obj_add_flag(ais_markers[i], LV_OBJ_FLAG_HIDDEN);
    }
    anchor_marker = make_anchor_marker(plot);
    lv_obj_set_pos(anchor_marker, PLOT_CENTER - 14, PLOT_CENTER - 16);
    static lv_point_t boat_points[] = {
        {13, 1}, {3, 28}, {13, 23}, {23, 28}, {13, 1},
    };
    boat_marker = lv_line_create(plot);
    lv_line_set_points(boat_marker, boat_points,
                       sizeof(boat_points) / sizeof(boat_points[0]));
    lv_obj_set_size(boat_marker, 27, 30);
    lv_obj_set_style_line_width(boat_marker, 3, 0);
    lv_obj_set_style_line_color(boat_marker, COLOR_CYAN, 0);
    lv_obj_set_style_line_rounded(boat_marker, true, 0);

    status_panel = panel_at(anchor_screen, 370, 48, 422, 94);
    status_label = label_at(status_panel, "INACTIVE", &lv_font_montserrat_24,
                            COLOR_MUTED, 16, 12);
    reason_label = label_at(status_panel, "Anchor position or radius not set",
                            &lv_font_montserrat_14, COLOR_TEXT, 16, 48);
    gps_label = label_at(status_panel, "GPS AGE  --", &lv_font_montserrat_12,
                         COLOR_MUTED, 300, 16);

    metric_card(anchor_screen, 370, 150, 112, "DISTANCE FROM ANCHOR", "--", "m",
                "MAX -- m", COLOR_AMBER, &distance_label, &radius_label);
    metric_card(anchor_screen, 584, 150, 112, "ANCHOR TO VESSEL", "---", "deg",
                "HEAD-UP PLOT", COLOR_CYAN, &bearing_label, NULL);
    metric_card(anchor_screen, 370, 270, 132, "VESSEL HEADING", "---", "deg",
                "TRUE HEADING", COLOR_BLUE, &heading_label, NULL);
    metric_card(anchor_screen, 584, 270, 132, "TRUE WIND", "--", "kn",
                "DIRECTION --", COLOR_CYAN, &wind_label, &wind_detail_label);

    lv_obj_t *nav = lv_obj_create(anchor_screen);
    lv_obj_set_pos(nav, 0, SCREEN_H - NAV_H);
    lv_obj_set_size(nav, SCREEN_W, NAV_H);
    lv_obj_set_style_bg_color(nav, COLOR_PANEL_2, 0);
    lv_obj_set_style_bg_opa(nav, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(nav, 0, 0);
    lv_obj_set_style_pad_all(nav, 0, 0);
    no_scroll(nav);
    nav_button(nav, 8, LV_SYMBOL_HOME, "OVERVIEW", false, show_overview);
    nav_button(nav, 272, LV_SYMBOL_EYE_OPEN, "ANCHOR WATCH", true, NULL);
    nav_button(nav, 536, LV_SYMBOL_SETTINGS, "SYSTEMS", false, NULL);
    lv_timer_create(telemetry_timer, 500, NULL);
    telemetry_timer(NULL);
}

void krishna_anchor_watch_show(void)
{
    if (anchor_screen != NULL) lv_scr_load(anchor_screen);
}
