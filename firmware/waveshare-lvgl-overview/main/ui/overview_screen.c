#include "overview_screen.h"

#include <math.h>
#include <stdio.h>
#include <time.h>

#include "esp_timer.h"
#include "lvgl.h"
#include "telemetry/telemetry_state.h"
#include "anchor_watch_screen.h"

#define SCREEN_W 800
#define SCREEN_H 480
#define TOP_H 40
#define NAV_H 54
#define GAP 8
#define AIS_PLOT_CENTER_X 180
#define AIS_PLOT_CENTER_Y 158
#define NORTH_MARKER_RADIUS 125.0

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

static lv_style_t style_panel;
static lv_style_t style_card;
static lv_obj_t *interaction_label;
static lv_obj_t *wifi_status_label;
static lv_obj_t *wifi_strength_parts[4];
static lv_obj_t *signalk_status_label;
static lv_obj_t *signalk_status_icon;
static lv_obj_t *gps_status_label;
static lv_obj_t *gps_status_icon;
static lv_obj_t *clock_label;
static lv_obj_t *wind_value_label;
static lv_obj_t *wind_unit_label;
static lv_obj_t *wind_detail_label;
static lv_obj_t *depth_value_label;
static lv_obj_t *depth_detail_label;
static lv_obj_t *speed_value_label;
static lv_obj_t *speed_detail_label;
static lv_obj_t *house_battery_value_label;
static lv_obj_t *house_battery_bar;
static lv_obj_t *start_battery_value_label;
static lv_obj_t *start_battery_bar;
static lv_obj_t *anchor_wind_value_label;
static lv_obj_t *north_label;
static lv_obj_t *water_value_label;
static lv_obj_t *water_bar;
static lv_obj_t *solar_value_label;
static lv_obj_t *solar_bar;
static lv_obj_t *ais_plot_targets[TELEMETRY_MAX_AIS_TARGETS];
static lv_obj_t *ais_count_label;
static lv_obj_t *ais_summary_value_label;
static lv_obj_t *ais_summary_detail_label;
static telemetry_state_t ui_telemetry_state;
static lv_obj_t *overview_screen;

static void no_scroll(lv_obj_t *obj)
{
    lv_obj_clear_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_scrollbar_mode(obj, LV_SCROLLBAR_MODE_OFF);
}

static lv_obj_t *label_at(lv_obj_t *parent, const char *text, const lv_font_t *font,
                          lv_color_t color, lv_coord_t x, lv_coord_t y)
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
    lv_obj_add_style(panel, &style_panel, 0);
    lv_obj_set_pos(panel, x, y);
    lv_obj_set_size(panel, w, h);
    no_scroll(panel);
    return panel;
}

static lv_obj_t *metric_card(lv_obj_t *parent, lv_coord_t y, const char *title,
                             const char *value, const char *unit, const char *detail,
                             lv_color_t accent, lv_obj_t **value_out,
                             lv_obj_t **unit_out, lv_obj_t **detail_out)
{
    lv_obj_t *card = lv_obj_create(parent);
    lv_obj_add_style(card, &style_card, 0);
    lv_obj_set_pos(card, 0, y);
    lv_obj_set_size(card, lv_pct(100), 84);
    no_scroll(card);

    lv_obj_t *marker = lv_obj_create(card);
    lv_obj_set_size(marker, 3, 58);
    lv_obj_set_pos(marker, 0, 10);
    lv_obj_set_style_bg_color(marker, accent, 0);
    lv_obj_set_style_bg_opa(marker, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(marker, 0, 0);
    lv_obj_set_style_radius(marker, 2, 0);
    no_scroll(marker);

    label_at(card, title, &lv_font_montserrat_12, COLOR_MUTED, 12, 8);
    lv_obj_t *value_label =
        label_at(card, value, &lv_font_montserrat_28, COLOR_TEXT, 12, 25);
    lv_obj_t *unit_label =
        label_at(card, unit, &lv_font_montserrat_14, COLOR_MUTED, 82, 36);
    lv_obj_t *detail_label =
        label_at(card, detail, &lv_font_montserrat_12, accent, 12, 62);
    if (value_out != NULL) {
        *value_out = value_label;
    }
    if (unit_out != NULL) {
        *unit_out = unit_label;
    }
    if (detail_out != NULL) {
        *detail_out = detail_label;
    }
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
    if (text_out != NULL) {
        *text_out = text_label;
    }
    if (icon_out != NULL) {
        *icon_out = icon_label;
    }
    if (pill_out != NULL) {
        *pill_out = pill;
    }
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

static void navigation_event(lv_event_t *event)
{
    const char *name = lv_event_get_user_data(event);
    if (name != NULL && strcmp(name, "ANCHOR WATCH") == 0) {
        krishna_anchor_watch_show();
        return;
    }
    if (interaction_label != NULL) {
        lv_label_set_text_fmt(interaction_label, "%s screen follows this Overview milestone", name);
        lv_obj_set_style_text_color(interaction_label, COLOR_CYAN, 0);
    }
}

static void nav_button(lv_obj_t *parent, lv_coord_t x, lv_coord_t w,
                       const char *symbol, const char *text, bool active)
{
    lv_obj_t *button = lv_btn_create(parent);
    lv_obj_set_pos(button, x, 4);
    lv_obj_set_size(button, w, 46);
    lv_obj_set_style_radius(button, 8, 0);
    lv_obj_set_style_shadow_width(button, 0, 0);
    lv_obj_set_style_bg_color(button, active ? COLOR_BLUE : COLOR_PANEL, 0);
    lv_obj_set_style_bg_opa(button, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(button, active ? 0 : 1, 0);
    lv_obj_set_style_border_color(button, COLOR_BORDER, 0);
    lv_obj_set_style_pad_all(button, 0, 0);
    label_at(button, symbol, &lv_font_montserrat_20,
             active ? COLOR_TEXT : COLOR_MUTED, 55, 13);
    label_at(button, text, &lv_font_montserrat_14,
             active ? COLOR_TEXT : COLOR_MUTED, 84, 15);
    if (!active) {
        lv_obj_add_event_cb(button, navigation_event, LV_EVENT_CLICKED, (void *)text);
    }
}

static void make_top_bar(lv_obj_t *screen)
{
    lv_obj_t *bar = lv_obj_create(screen);
    lv_obj_set_pos(bar, 0, 0);
    lv_obj_set_size(bar, SCREEN_W, TOP_H);
    lv_obj_set_style_bg_color(bar, COLOR_PANEL, 0);
    lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(bar, 0, 0);
    lv_obj_set_style_pad_all(bar, 0, 0);
    no_scroll(bar);

    label_at(bar, "KRISHNA", &lv_font_montserrat_20, COLOR_TEXT, 12, 9);
    label_at(bar, "OVERVIEW", &lv_font_montserrat_12, COLOR_CYAN, 116, 14);
    lv_obj_t *wifi_pill;
    status_pill(bar, 244, 116, "", "Wi-Fi", COLOR_MUTED,
                &wifi_pill, NULL, &wifi_status_label);
    make_wifi_strength_icon(wifi_pill);
    status_pill(bar, 368, 106, LV_SYMBOL_REFRESH, "SK --", COLOR_MUTED,
                NULL, &signalk_status_icon, &signalk_status_label);
    status_pill(bar, 482, 106, LV_SYMBOL_GPS, "GPS --", COLOR_MUTED,
                NULL, &gps_status_icon, &gps_status_label);
    clock_label =
        label_at(bar, "--:--", &lv_font_montserrat_20, COLOR_TEXT, 730, 9);
}

static void make_anchor_panel(lv_obj_t *body)
{
    lv_obj_t *panel = panel_at(body, 188, 0, 360, 370);
    label_at(panel, "ANCHOR WATCH", &lv_font_montserrat_12, COLOR_MUTED, 14, 12);

    lv_obj_t *state = label_at(panel, "INACTIVE", &lv_font_montserrat_20, COLOR_MUTED, 274, 9);
    lv_obj_align(state, LV_ALIGN_TOP_RIGHT, -14, 9);

    lv_obj_t *plot = lv_obj_create(panel);
    lv_obj_set_size(plot, 236, 236);
    lv_obj_align(plot, LV_ALIGN_TOP_MID, 0, 40);
    lv_obj_set_style_radius(plot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(plot, lv_color_make(7, 22, 37), 0);
    lv_obj_set_style_bg_opa(plot, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(plot, 2, 0);
    lv_obj_set_style_border_color(plot, COLOR_BLUE, 0);
    lv_obj_set_style_outline_width(plot, 1, 0);
    lv_obj_set_style_outline_color(plot, COLOR_BORDER, 0);
    lv_obj_set_style_outline_pad(plot, 18, 0);
    no_scroll(plot);

    lv_obj_t *radius = lv_obj_create(plot);
    lv_obj_set_size(radius, 148, 148);
    lv_obj_center(radius);
    lv_obj_set_style_radius(radius, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(radius, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(radius, 2, 0);
    lv_obj_set_style_border_color(radius, COLOR_MUTED, 0);
    lv_obj_set_style_border_opa(radius, LV_OPA_70, 0);
    no_scroll(radius);

    static lv_point_t boat_points[] = {
        {13, 1}, {3, 28}, {13, 23}, {23, 28}, {13, 1},
    };
    lv_obj_t *boat = lv_line_create(plot);
    lv_line_set_points(boat, boat_points,
                       sizeof(boat_points) / sizeof(boat_points[0]));
    lv_obj_set_size(boat, 27, 30);
    lv_obj_center(boat);
    lv_obj_set_style_line_width(boat, 3, 0);
    lv_obj_set_style_line_color(boat, COLOR_CYAN, 0);
    lv_obj_set_style_line_rounded(boat, true, 0);

    for (int index = 0; index < TELEMETRY_MAX_AIS_TARGETS; index++) {
        ais_plot_targets[index] = lv_obj_create(plot);
        lv_obj_set_size(ais_plot_targets[index], 7, 7);
        lv_obj_set_style_radius(ais_plot_targets[index], LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_color(ais_plot_targets[index], COLOR_AMBER, 0);
        lv_obj_set_style_bg_opa(ais_plot_targets[index], LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(ais_plot_targets[index], 0, 0);
        lv_obj_add_flag(ais_plot_targets[index], LV_OBJ_FLAG_HIDDEN);
    }

    /* Keep North outside the plot so its orbit is not clipped by the circle. */
    north_label =
        label_at(panel, "N", &lv_font_montserrat_12, COLOR_MUTED, 175, 26);
    lv_obj_t *range_10_label =
        label_at(plot, "10 NM", &lv_font_montserrat_12, COLOR_MUTED, 0, 156);
    lv_obj_align(range_10_label, LV_ALIGN_TOP_MID, 0, 156);
    lv_obj_t *range_20_label =
        label_at(plot, "20 NM", &lv_font_montserrat_12, COLOR_TEXT, 0, 198);
    lv_obj_align(range_20_label, LV_ALIGN_TOP_MID, 0, 198);

    ais_count_label =
        label_at(panel, "0 targets", &lv_font_montserrat_20, COLOR_TEXT, 18, 295);
    label_at(panel, "Moving AIS within 20 NM", &lv_font_montserrat_12,
             COLOR_MUTED, 20, 327);
    anchor_wind_value_label =
        label_at(panel, "-- kn", &lv_font_montserrat_20, COLOR_MUTED, 252, 295);
    label_at(panel, "App Wind", &lv_font_montserrat_12, COLOR_MUTED, 254, 327);

    interaction_label = label_at(panel, "Traffic view  |  Anchor inactive", &lv_font_montserrat_12,
                                 COLOR_MUTED, 238, 352);
    lv_obj_align(interaction_label, LV_ALIGN_BOTTOM_RIGHT, -14, -8);
}

static lv_obj_t *progress_row(lv_obj_t *parent, lv_coord_t y, const char *name,
                              const char *value, int percent, lv_color_t color,
                              lv_obj_t **value_out)
{
    label_at(parent, name, &lv_font_montserrat_12, COLOR_MUTED, 12, y);
    lv_obj_t *value_label = label_at(parent, value, &lv_font_montserrat_14, COLOR_TEXT, 0, y - 2);
    lv_obj_align(value_label, LV_ALIGN_TOP_RIGHT, -12, y - 2);
    lv_obj_t *bar = lv_bar_create(parent);
    lv_obj_set_pos(bar, 12, y + 20);
    lv_obj_set_size(bar, 192, 7);
    lv_bar_set_range(bar, 0, 100);
    lv_bar_set_value(bar, percent, LV_ANIM_OFF);
    lv_obj_set_style_bg_color(bar, COLOR_BORDER, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_bg_color(bar, color, LV_PART_INDICATOR);
    lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_INDICATOR);
    lv_obj_set_style_radius(bar, 4, LV_PART_MAIN | LV_PART_INDICATOR);
    if (value_out != NULL) {
        *value_out = value_label;
    }
    return bar;
}

static void make_systems_column(lv_obj_t *body)
{
    lv_obj_t *battery = panel_at(body, 556, 0, 228, 154);
    label_at(battery, "POWER", &lv_font_montserrat_12, COLOR_MUTED, 12, 10);
    house_battery_bar =
        progress_row(battery, 37, "HOUSE", "--", 0, COLOR_GREEN,
                     &house_battery_value_label);
    start_battery_bar =
        progress_row(battery, 91, "START", "--", 0, COLOR_CYAN,
                     &start_battery_value_label);

    lv_obj_t *stores = panel_at(body, 556, 162, 228, 136);
    label_at(stores, "VESSEL STORES", &lv_font_montserrat_12, COLOR_MUTED, 12, 10);
    water_bar = progress_row(stores, 36, "WATER", "--", 0, COLOR_BLUE,
                             &water_value_label);
    solar_bar = progress_row(stores, 88, "SOLAR", "--", 0, COLOR_GREEN,
                             &solar_value_label);

    lv_obj_t *systems = panel_at(body, 556, 306, 228, 64);
    label_at(systems, "ESSENTIAL SYSTEMS", &lv_font_montserrat_12, COLOR_MUTED, 12, 8);
    label_at(systems, LV_SYMBOL_WARNING "  DATA", &lv_font_montserrat_16, COLOR_AMBER, 12, 32);
    label_at(systems, "PARTIAL", &lv_font_montserrat_16, COLOR_MUTED, 118, 32);
}

static void make_navigation(lv_obj_t *screen)
{
    lv_obj_t *nav = lv_obj_create(screen);
    lv_obj_set_pos(nav, 0, SCREEN_H - NAV_H);
    lv_obj_set_size(nav, SCREEN_W, NAV_H);
    lv_obj_set_style_bg_color(nav, COLOR_PANEL_2, 0);
    lv_obj_set_style_bg_opa(nav, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(nav, 0, 0);
    lv_obj_set_style_pad_all(nav, 0, 0);
    no_scroll(nav);
    nav_button(nav, 8, 256, LV_SYMBOL_HOME, "OVERVIEW", true);
    nav_button(nav, 272, 256, LV_SYMBOL_EYE_OPEN, "ANCHOR WATCH", false);
    nav_button(nav, 536, 256, LV_SYMBOL_SETTINGS, "SYSTEMS", false);
}

static void set_metric(lv_obj_t *value_label, lv_obj_t *detail_label,
                       telemetry_quality_t quality, const char *value,
                       const char *detail)
{
    if (quality == TELEMETRY_QUALITY_UNAVAILABLE) {
        lv_label_set_text(value_label, "--");
        lv_label_set_text(detail_label, "Unavailable");
        lv_obj_set_style_text_color(value_label, COLOR_MUTED, 0);
        lv_obj_set_style_text_color(detail_label, COLOR_MUTED, 0);
        return;
    }
    lv_label_set_text(value_label, value);
    lv_label_set_text(detail_label,
                      quality == TELEMETRY_QUALITY_STALE ? "Stale data" : detail);
    lv_obj_set_style_text_color(value_label,
                                quality == TELEMETRY_QUALITY_STALE ? COLOR_AMBER : COLOR_TEXT,
                                0);
    lv_obj_set_style_text_color(detail_label,
                                quality == TELEMETRY_QUALITY_STALE ? COLOR_AMBER : COLOR_GREEN,
                                0);
}

static void set_battery(lv_obj_t *value_label, lv_obj_t *bar,
                        const telemetry_numeric_t *voltage,
                        const telemetry_numeric_t *current,
                        const telemetry_numeric_t *soc, int64_t now_ms)
{
    telemetry_quality_t quality =
        telemetry_numeric_quality(voltage, now_ms, 5000);
    if (quality == TELEMETRY_QUALITY_UNAVAILABLE) {
        lv_label_set_text(value_label, "--");
        lv_obj_set_style_text_color(value_label, COLOR_MUTED, 0);
        lv_bar_set_value(bar, 0, LV_ANIM_OFF);
        return;
    }

    char text[48];
    if (current->valid) {
        snprintf(text, sizeof(text), "%.1f V  %+.1f A", voltage->value,
                 current->value);
    } else {
        snprintf(text, sizeof(text), "%.1f V", voltage->value);
    }
    lv_label_set_text(value_label, text);
    lv_obj_set_style_text_color(
        value_label, quality == TELEMETRY_QUALITY_STALE ? COLOR_AMBER : COLOR_TEXT,
        0);
    int percent = soc->valid ? (int)lround(soc->value * 100.0) : 0;
    lv_bar_set_value(bar, LV_CLAMP(0, percent, 100), LV_ANIM_OFF);
}

static int update_ais_plot(const telemetry_state_t *state, int64_t now_ms)
{
    int visible = 0;
    double heading = state->heading_true_rad.valid
                         ? state->heading_true_rad.value
                         : 0.0;
    for (int index = 0; index < TELEMETRY_MAX_AIS_TARGETS; index++) {
        lv_obj_add_flag(ais_plot_targets[index], LV_OBJ_FLAG_HIDDEN);
        const telemetry_ais_target_t *target = &state->ais_targets[index];
        bool fresh = target->position_valid &&
                     target->speed_over_ground_mps.valid &&
                     now_ms >= target->position_updated_ms &&
                     now_ms - target->position_updated_ms <= 15000 &&
                     now_ms >= target->speed_over_ground_mps.updated_ms &&
                     now_ms - target->speed_over_ground_mps.updated_ms <= 15000;
        if (!state->own_position_valid || !fresh ||
            target->speed_over_ground_mps.value <= 0.257222) {
            continue;
        }

        double lat1 = state->own_latitude_deg * 0.017453292519943295;
        double lat2 = target->latitude_deg * 0.017453292519943295;
        double dlat = lat2 - lat1;
        double dlon = (target->longitude_deg - state->own_longitude_deg) *
                      0.017453292519943295;
        double a = sin(dlat / 2.0) * sin(dlat / 2.0) +
                   cos(lat1) * cos(lat2) * sin(dlon / 2.0) * sin(dlon / 2.0);
        double distance_nm = 3440.065 * 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
        if (distance_nm > 20.0) {
            continue;
        }
        double bearing = atan2(sin(dlon) * cos(lat2),
                               cos(lat1) * sin(lat2) -
                                   sin(lat1) * cos(lat2) * cos(dlon));
        double relative = bearing - heading;
        double radius = LV_CLAMP(0.0, distance_nm / 20.0 * 103.0, 103.0);
        lv_coord_t x = 114 + (lv_coord_t)lround(sin(relative) * radius);
        lv_coord_t y = 114 - (lv_coord_t)lround(cos(relative) * radius);
        lv_obj_set_pos(ais_plot_targets[index], x, y);
        lv_obj_clear_flag(ais_plot_targets[index], LV_OBJ_FLAG_HIDDEN);
        visible++;
    }
    return visible;
}

static void telemetry_timer(lv_timer_t *timer)
{
    telemetry_state_t *state_ptr = &ui_telemetry_state;
    telemetry_state_snapshot(state_ptr);
#define state (*state_ptr)
    int64_t now_ms = esp_timer_get_time() / 1000;
    char value[32];

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
        lv_obj_set_style_arc_color(
            wifi_strength_parts[index],
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
    lv_color_t signalk_color =
        signalk_fresh ? COLOR_GREEN : signalk_stale ? COLOR_AMBER : COLOR_MUTED;
    lv_obj_set_style_text_color(signalk_status_label, signalk_color, 0);
    lv_obj_set_style_text_color(signalk_status_icon, signalk_color, 0);

    telemetry_quality_t gps_quality =
        telemetry_numeric_quality(&state.gps_quality, now_ms, 5000);
    lv_label_set_text(gps_status_label,
                      gps_quality == TELEMETRY_QUALITY_LIVE ? "GPS LIVE"
                      : gps_quality == TELEMETRY_QUALITY_STALE ? "GPS STALE"
                                                               : "GPS --");
    lv_color_t gps_color =
        gps_quality == TELEMETRY_QUALITY_LIVE ? COLOR_GREEN
        : gps_quality == TELEMETRY_QUALITY_STALE ? COLOR_AMBER : COLOR_MUTED;
    lv_obj_set_style_text_color(gps_status_label, gps_color, 0);
    lv_obj_set_style_text_color(gps_status_icon, gps_color, 0);

    if (state.signalk_clock.valid) {
        int64_t elapsed_ms = now_ms - state.signalk_clock.received_ms;
        time_t epoch_seconds =
            (time_t)((state.signalk_clock.epoch_ms + elapsed_ms) / 1000);
        struct tm local;
        if (localtime_r(&epoch_seconds, &local) != NULL) {
            snprintf(value, sizeof(value), "%02d:%02d", local.tm_hour,
                     local.tm_min);
            lv_label_set_text(clock_label, value);
        }
    }

    telemetry_quality_t heading_quality =
        telemetry_numeric_quality(&state.heading_true_rad, now_ms, 5000);
    if (heading_quality != TELEMETRY_QUALITY_UNAVAILABLE) {
        double heading = state.heading_true_rad.value;
        lv_obj_update_layout(north_label);
        lv_coord_t north_x =
            AIS_PLOT_CENTER_X - lv_obj_get_width(north_label) / 2 -
            (lv_coord_t)lround(NORTH_MARKER_RADIUS * sin(heading));
        lv_coord_t north_y =
            AIS_PLOT_CENTER_Y - lv_obj_get_height(north_label) / 2 -
            (lv_coord_t)lround(NORTH_MARKER_RADIUS * cos(heading));
        lv_obj_set_pos(north_label, north_x, north_y);
        lv_obj_set_style_text_color(
            north_label,
            heading_quality == TELEMETRY_QUALITY_STALE ? COLOR_AMBER : COLOR_TEXT,
            0);
    } else {
        lv_obj_update_layout(north_label);
        lv_obj_set_pos(north_label,
                       AIS_PLOT_CENTER_X - lv_obj_get_width(north_label) / 2,
                       AIS_PLOT_CENTER_Y - lv_obj_get_height(north_label) / 2 -
                           (lv_coord_t)NORTH_MARKER_RADIUS);
        lv_obj_set_style_text_color(north_label, COLOR_MUTED, 0);
    }

    int active_ais = update_ais_plot(&state, now_ms);
    lv_label_set_text_fmt(ais_count_label, "%d target%s", active_ais,
                          active_ais == 1 ? "" : "s");
    lv_label_set_text_fmt(ais_summary_value_label, "%d", active_ais);
    lv_label_set_text(ais_summary_detail_label,
                      state.own_position_valid ? "Moving within 20 NM"
                                               : "Position unavailable");
    lv_obj_set_style_text_color(
        ais_summary_detail_label,
        state.own_position_valid ? COLOR_GREEN : COLOR_AMBER, 0);

    const telemetry_numeric_t *wind = state.true_wind_speed_mps.valid
                                          ? &state.true_wind_speed_mps
                                          : &state.apparent_wind_speed_mps;
    telemetry_quality_t wind_quality =
        telemetry_numeric_quality(wind, now_ms, 4000);
    snprintf(value, sizeof(value), "%.1f", wind->value * 1.94384449);
    set_metric(wind_value_label, wind_detail_label, wind_quality, value,
               state.true_wind_speed_mps.valid ? "True wind" : "Apparent wind");
    if (telemetry_numeric_quality(&state.apparent_wind_speed_mps, now_ms, 4000) ==
        TELEMETRY_QUALITY_UNAVAILABLE) {
        lv_label_set_text(anchor_wind_value_label, "-- kn");
        lv_obj_set_style_text_color(anchor_wind_value_label, COLOR_MUTED, 0);
    } else {
        snprintf(value, sizeof(value), "%.1f kn",
                 state.apparent_wind_speed_mps.value * 1.94384449);
        lv_label_set_text(anchor_wind_value_label, value);
        lv_obj_set_style_text_color(
            anchor_wind_value_label,
            telemetry_numeric_quality(&state.apparent_wind_speed_mps, now_ms,
                                      4000) == TELEMETRY_QUALITY_STALE
                ? COLOR_AMBER
                : COLOR_TEXT,
            0);
    }

    const telemetry_numeric_t *depth = state.depth_below_keel_m.valid
                                           ? &state.depth_below_keel_m
                                           : &state.depth_below_surface_m;
    telemetry_quality_t depth_quality =
        telemetry_numeric_quality(depth, now_ms, 3000);
    snprintf(value, sizeof(value), "%.1f", depth->value);
    set_metric(depth_value_label, depth_detail_label, depth_quality, value,
               state.depth_below_keel_m.valid ? "Below keel" : "Below surface");

    telemetry_quality_t speed_quality = telemetry_numeric_quality(
        &state.speed_over_ground_mps, now_ms, 5000);
    snprintf(value, sizeof(value), "%.1f",
             state.speed_over_ground_mps.value * 1.94384449);
    set_metric(speed_value_label, speed_detail_label, speed_quality, value,
               "Speed over ground");

    set_battery(house_battery_value_label, house_battery_bar,
                &state.house_battery_voltage_v,
                &state.house_battery_current_a,
                &state.house_battery_soc_ratio, now_ms);
    set_battery(start_battery_value_label, start_battery_bar,
                &state.start_battery_voltage_v,
                &state.start_battery_current_a,
                &state.start_battery_soc_ratio, now_ms);

    telemetry_quality_t water_quality = telemetry_numeric_quality(
        &state.fresh_water_level_ratio, now_ms, 5000);
    if (water_quality == TELEMETRY_QUALITY_UNAVAILABLE) {
        lv_label_set_text(water_value_label, "--");
        lv_bar_set_value(water_bar, 0, LV_ANIM_OFF);
        lv_obj_set_style_text_color(water_value_label, COLOR_MUTED, 0);
    } else {
        int water_percent =
            LV_CLAMP(0, (int)lround(state.fresh_water_level_ratio.value * 100.0),
                     100);
        lv_label_set_text_fmt(water_value_label, "%d%%", water_percent);
        lv_bar_set_value(water_bar, water_percent, LV_ANIM_OFF);
        lv_obj_set_style_text_color(
            water_value_label,
            water_quality == TELEMETRY_QUALITY_STALE ? COLOR_AMBER : COLOR_TEXT,
            0);
    }

    telemetry_quality_t solar_quality = telemetry_numeric_quality(
        &state.solar_panel_power_w, now_ms, 5000);
    if (solar_quality == TELEMETRY_QUALITY_UNAVAILABLE) {
        lv_label_set_text(solar_value_label, "--");
        lv_bar_set_value(solar_bar, 0, LV_ANIM_OFF);
        lv_obj_set_style_text_color(solar_value_label, COLOR_MUTED, 0);
    } else {
        int solar_watts = (int)lround(state.solar_panel_power_w.value);
        int solar_percent = LV_CLAMP(0, solar_watts * 100 / 50, 100);
        lv_label_set_text_fmt(solar_value_label, "%d W", solar_watts);
        lv_bar_set_value(solar_bar, solar_percent, LV_ANIM_OFF);
        lv_obj_set_style_text_color(
            solar_value_label,
            solar_quality == TELEMETRY_QUALITY_STALE ? COLOR_AMBER : COLOR_TEXT,
            0);
    }
#undef state
}

void krishna_overview_create(void)
{
    lv_style_init(&style_panel);
    lv_style_set_bg_color(&style_panel, COLOR_PANEL);
    lv_style_set_bg_opa(&style_panel, LV_OPA_COVER);
    lv_style_set_border_width(&style_panel, 1);
    lv_style_set_border_color(&style_panel, COLOR_BORDER);
    lv_style_set_radius(&style_panel, 10);
    lv_style_set_pad_all(&style_panel, 0);

    lv_style_init(&style_card);
    lv_style_set_bg_color(&style_card, COLOR_PANEL);
    lv_style_set_bg_opa(&style_card, LV_OPA_COVER);
    lv_style_set_border_width(&style_card, 1);
    lv_style_set_border_color(&style_card, COLOR_BORDER);
    lv_style_set_radius(&style_card, 10);
    lv_style_set_pad_all(&style_card, 0);

    lv_obj_t *screen = lv_scr_act();
    overview_screen = screen;
    lv_obj_set_style_bg_color(screen, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(screen, 0, 0);
    no_scroll(screen);

    make_top_bar(screen);

    lv_obj_t *body = lv_obj_create(screen);
    lv_obj_set_pos(body, 8, TOP_H + 8);
    lv_obj_set_size(body, 784, 370);
    lv_obj_set_style_bg_opa(body, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(body, 0, 0);
    lv_obj_set_style_pad_all(body, 0, 0);
    no_scroll(body);

    lv_obj_t *metrics = lv_obj_create(body);
    lv_obj_set_pos(metrics, 0, 0);
    lv_obj_set_size(metrics, 180, 370);
    lv_obj_set_style_bg_opa(metrics, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(metrics, 0, 0);
    lv_obj_set_style_pad_all(metrics, 0, 0);
    no_scroll(metrics);
    metric_card(metrics, 0, "WIND", "--", "kn", "Unavailable", COLOR_CYAN,
                &wind_value_label, &wind_unit_label, &wind_detail_label);
    metric_card(metrics, 92, "DEPTH", "--", "m", "Unavailable", COLOR_BLUE,
                &depth_value_label, NULL, &depth_detail_label);
    metric_card(metrics, 184, "SPEED", "--", "kn", "Unavailable", COLOR_GREEN,
                &speed_value_label, NULL, &speed_detail_label);
    metric_card(metrics, 276, "AIS", "0", "targets", "Position unavailable",
                COLOR_AMBER, &ais_summary_value_label, NULL,
                &ais_summary_detail_label);

    make_anchor_panel(body);
    make_systems_column(body);
    make_navigation(screen);
    lv_timer_create(telemetry_timer, 500, NULL);
    telemetry_timer(NULL);
}

void krishna_overview_show(void)
{
    if (overview_screen != NULL) lv_scr_load(overview_screen);
}
