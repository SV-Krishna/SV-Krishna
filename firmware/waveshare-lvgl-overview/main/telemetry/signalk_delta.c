#include "signalk_delta.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "telemetry_state.h"

static bool leap_year(int year)
{
    return year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
}

static int64_t days_before_year(int year)
{
    int64_t prior = year - 1;
    return 365 * prior + prior / 4 - prior / 100 + prior / 400;
}

static bool parse_signalk_timestamp(const char *text, int64_t *epoch_ms)
{
    int year, month, day, hour, minute, second, millis = 0;
    char zone = '\0';
    int matched = sscanf(text, "%4d-%2d-%2dT%2d:%2d:%2d.%3d%c",
                         &year, &month, &day, &hour, &minute, &second,
                         &millis, &zone);
    bool parsed = matched == 8;
    if (matched != 8) {
        millis = 0;
        matched = sscanf(text, "%4d-%2d-%2dT%2d:%2d:%2d%c",
                         &year, &month, &day, &hour, &minute, &second, &zone);
        parsed = matched == 7;
    }
    static const int month_days[] =
        {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (!parsed || zone != 'Z' || year < 1970 || month < 1 || month > 12 ||
        day < 1 || day > month_days[month - 1] + (month == 2 && leap_year(year)) ||
        hour > 23 || minute > 59 || second > 60) {
        return false;
    }
    int64_t days = days_before_year(year) - days_before_year(1970);
    for (int index = 1; index < month; index++) {
        days += month_days[index - 1] + (index == 2 && leap_year(year));
    }
    days += day - 1;
    *epoch_ms = ((days * 24 + hour) * 60 * 60 + minute * 60 + second) * 1000 +
                millis;
    return true;
}

static telemetry_anchor_notification_state_t parse_notification_state(
    const cJSON *value)
{
    const cJSON *item = cJSON_GetObjectItemCaseSensitive(value, "state");
    if (!cJSON_IsString(item)) return TELEMETRY_ANCHOR_NOTIFICATION_UNKNOWN;
    if (strcmp(item->valuestring, "normal") == 0) return TELEMETRY_ANCHOR_NOTIFICATION_NORMAL;
    if (strcmp(item->valuestring, "warn") == 0 ||
        strcmp(item->valuestring, "alert") == 0)
        return TELEMETRY_ANCHOR_NOTIFICATION_WARNING;
    if (strcmp(item->valuestring, "alarm") == 0) return TELEMETRY_ANCHOR_NOTIFICATION_ALARM;
    if (strcmp(item->valuestring, "emergency") == 0) return TELEMETRY_ANCHOR_NOTIFICATION_EMERGENCY;
    return TELEMETRY_ANCHOR_NOTIFICATION_UNKNOWN;
}

size_t signalk_delta_apply(const char *payload, size_t length, int64_t received_ms)
{
    if (payload == NULL || length == 0) {
        return 0;
    }

    cJSON *root = cJSON_ParseWithLength(payload, length);
    if (root == NULL) {
        return 0;
    }

    size_t applied = 0;
    const cJSON *self = cJSON_GetObjectItemCaseSensitive(root, "self");
    if (cJSON_IsString(self)) {
        char self_context[128];
        snprintf(self_context, sizeof(self_context), "%s%s",
                 strncmp(self->valuestring, "vessels.", 8) == 0 ? ""
                                                                 : "vessels.",
                 self->valuestring);
        telemetry_state_set_self_context(self_context);
    }
    const cJSON *context_item =
        cJSON_GetObjectItemCaseSensitive(root, "context");
    const char *context = cJSON_IsString(context_item)
                              ? context_item->valuestring
                              : "vessels.self";
    bool self_delta = telemetry_state_context_is_self(context);
    const cJSON *updates = cJSON_GetObjectItemCaseSensitive(root, "updates");
    const cJSON *update = NULL;
    cJSON_ArrayForEach(update, updates) {
        telemetry_state_note_delta(received_ms);
        const cJSON *timestamp =
            cJSON_GetObjectItemCaseSensitive(update, "timestamp");
        int64_t epoch_ms;
        if (cJSON_IsString(timestamp) &&
            parse_signalk_timestamp(timestamp->valuestring, &epoch_ms)) {
            telemetry_state_set_clock(epoch_ms, received_ms);
        }
        const cJSON *values = cJSON_GetObjectItemCaseSensitive(update, "values");
        const cJSON *entry = NULL;
        cJSON_ArrayForEach(entry, values) {
            const cJSON *path = cJSON_GetObjectItemCaseSensitive(entry, "path");
            const cJSON *value = cJSON_GetObjectItemCaseSensitive(entry, "value");
            if (!cJSON_IsString(path)) {
                continue;
            }
            if (strcmp(path->valuestring, "navigation.position") == 0) {
                const cJSON *latitude =
                    cJSON_GetObjectItemCaseSensitive(value, "latitude");
                const cJSON *longitude =
                    cJSON_GetObjectItemCaseSensitive(value, "longitude");
                if (cJSON_IsNumber(latitude) && cJSON_IsNumber(longitude)) {
                    telemetry_state_update_position(
                        context, latitude->valuedouble, longitude->valuedouble,
                        received_ms);
                    if (self_delta) {
                        telemetry_state_update_path(
                            "navigation.gnss.methodQuality", 1.0, true,
                            received_ms);
                    }
                    applied++;
                } else if (cJSON_IsNull(value) && self_delta) {
                    telemetry_state_invalidate_position(context, received_ms);
                    applied++;
                }
                continue;
            }
            if (self_delta && strcmp(path->valuestring,
                                     "navigation.anchor.position") == 0) {
                const cJSON *latitude = cJSON_GetObjectItemCaseSensitive(value, "latitude");
                const cJSON *longitude = cJSON_GetObjectItemCaseSensitive(value, "longitude");
                bool valid = cJSON_IsNumber(latitude) && cJSON_IsNumber(longitude);
                telemetry_state_update_anchor_position(
                    valid ? latitude->valuedouble : 0.0,
                    valid ? longitude->valuedouble : 0.0, valid, received_ms);
                applied++;
                continue;
            }
            if (self_delta && strcmp(path->valuestring,
                                     "notifications.navigation.anchor") == 0) {
                const cJSON *message = cJSON_GetObjectItemCaseSensitive(value, "message");
                bool valid = cJSON_IsObject(value);
                telemetry_state_update_anchor_notification(
                    valid ? parse_notification_state(value)
                          : TELEMETRY_ANCHOR_NOTIFICATION_NONE,
                    cJSON_IsString(message) ? message->valuestring : NULL,
                    valid, received_ms);
                applied++;
                continue;
            }
            bool numeric = cJSON_IsNumber(value);
            double number = numeric ? value->valuedouble : 0.0;
            if (!self_delta) {
                if (strcmp(path->valuestring,
                           "navigation.speedOverGround") == 0) {
                    telemetry_state_update_ais_speed(context, number, numeric,
                                                     received_ms);
                    applied++;
                }
                continue;
            }
            if (telemetry_state_update_path(path->valuestring, number, numeric,
                                            received_ms)) {
                applied++;
            }
        }
    }

    cJSON_Delete(root);
    return applied;
}
