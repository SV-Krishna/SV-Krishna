#include "telemetry_service.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_websocket_client.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

#include "signalk_delta.h"
#include "telemetry_state.h"

static const char *TAG = "telemetry";
static esp_websocket_client_handle_t websocket;
static bool wifi_connected;
static bool signalk_connected;
static bool received_telemetry;
static bool dashboard_telemetry_ready;
static unsigned observed_values;
static bool readiness_diagnostic_logged;
static telemetry_state_t readiness_state;

static const char subscription[] =
    "{\"context\":\"vessels.self\",\"subscribe\":["
    "{\"path\":\"navigation.speedOverGround\",\"period\":1000},"
    "{\"path\":\"navigation.position\",\"period\":1000},"
    "{\"path\":\"navigation.position.latitude\",\"period\":1000},"
    "{\"path\":\"navigation.position.longitude\",\"period\":1000},"
    "{\"path\":\"navigation.gnss.methodQuality\",\"period\":1000},"
    "{\"path\":\"navigation.headingTrue\",\"period\":1000},"
    "{\"path\":\"navigation.anchor.position\",\"period\":1000},"
    "{\"path\":\"navigation.anchor.position.latitude\",\"period\":1000},"
    "{\"path\":\"navigation.anchor.position.longitude\",\"period\":1000},"
    "{\"path\":\"navigation.anchor.maxRadius\",\"period\":1000},"
    "{\"path\":\"navigation.anchor.warningRadius\",\"period\":1000},"
    "{\"path\":\"navigation.anchor.currentRadius\",\"period\":1000},"
    "{\"path\":\"navigation.anchor.rodeLength\",\"period\":1000},"
    "{\"path\":\"notifications.navigation.anchor\",\"period\":1000},"
    "{\"path\":\"environment.depth.belowKeel\",\"period\":1000},"
    "{\"path\":\"environment.depth.belowSurface\",\"period\":1000},"
    "{\"path\":\"environment.wind.speedApparent\",\"period\":1000},"
    "{\"path\":\"environment.wind.speedTrue\",\"period\":1000},"
    "{\"path\":\"environment.wind.angleTrueWater\",\"period\":1000},"
    "{\"path\":\"environment.wind.directionTrue\",\"period\":1000},"
    "{\"path\":\"electrical.batteries.house.capacity.stateOfCharge\",\"period\":1000},"
    "{\"path\":\"electrical.batteries.house.voltage\",\"period\":1000},"
    "{\"path\":\"electrical.batteries.house.current\",\"period\":1000},"
    "{\"path\":\"electrical.batteries.start.capacity.stateOfCharge\",\"period\":1000},"
    "{\"path\":\"electrical.batteries.start.voltage\",\"period\":1000},"
    "{\"path\":\"electrical.batteries.start.current\",\"period\":1000},"
    "{\"path\":\"electrical.batteries.A.capacity.stateOfCharge\",\"period\":1000},"
    "{\"path\":\"electrical.batteries.A.voltage\",\"period\":1000},"
    "{\"path\":\"electrical.batteries.A.current\",\"period\":1000},"
    "{\"path\":\"tanks.freshWater.0.currentLevel\",\"period\":1000},"
    "{\"path\":\"electrical.solar.0.panelPower\",\"period\":1000}]}";

static const char ais_subscription[] =
    "{\"context\":\"vessels.*\",\"subscribe\":["
    "{\"path\":\"navigation.position\",\"period\":2000},"
    "{\"path\":\"navigation.speedOverGround\",\"period\":2000}]}";

static void publish_connections(void)
{
    telemetry_state_set_connections(wifi_connected, signalk_connected);
}

static void websocket_event(void *arg, esp_event_base_t base, int32_t event_id,
                            void *event_data)
{
    esp_websocket_event_data_t *data = event_data;
    switch (event_id) {
    case WEBSOCKET_EVENT_CONNECTED:
        signalk_connected = true;
        publish_connections();
        esp_websocket_client_send_text(websocket, subscription,
                                       strlen(subscription), portMAX_DELAY);
        esp_websocket_client_send_text(websocket, ais_subscription,
                                       strlen(ais_subscription), portMAX_DELAY);
        ESP_LOGI(TAG, "Signal K WebSocket connected and subscribed");
        break;
    case WEBSOCKET_EVENT_DISCONNECTED:
        signalk_connected = false;
        publish_connections();
        ESP_LOGW(TAG, "Signal K WebSocket disconnected");
        break;
    case WEBSOCKET_EVENT_DATA:
        if (data->op_code == 0x1 && data->payload_offset == 0 &&
            data->data_len == data->payload_len) {
            size_t applied = signalk_delta_apply(
                data->data_ptr, data->data_len, esp_timer_get_time() / 1000);
            observed_values += applied;
            wifi_ap_record_t access_point;
            if (esp_wifi_sta_get_ap_info(&access_point) == ESP_OK) {
                telemetry_state_set_wifi_rssi(access_point.rssi);
            }
            if (applied > 0 && !received_telemetry) {
                received_telemetry = true;
                ESP_LOGI(TAG, "First Signal K telemetry delta applied (%u values)",
                         (unsigned)applied);
            }
            if (applied > 0 && !dashboard_telemetry_ready) {
                telemetry_state_snapshot(&readiness_state);
                if (readiness_state.signalk_clock.valid &&
                    (readiness_state.true_wind_speed_mps.valid ||
                     readiness_state.apparent_wind_speed_mps.valid) &&
                    readiness_state.house_battery_voltage_v.valid &&
                    readiness_state.start_battery_voltage_v.valid &&
                    readiness_state.gps_quality.valid &&
                    readiness_state.heading_true_rad.valid &&
                    readiness_state.fresh_water_level_ratio.valid &&
                    readiness_state.solar_panel_power_w.valid) {
                    dashboard_telemetry_ready = true;
                    ESP_LOGI(TAG,
                             "Dashboard telemetry ready: clock, wind, power, stores, GPS and heading; Wi-Fi RSSI %d dBm",
                             readiness_state.wifi_rssi_dbm);
                }
                if (!readiness_diagnostic_logged && observed_values >= 16) {
                    readiness_diagnostic_logged = true;
                    ESP_LOGI(TAG,
                             "Telemetry readiness clock=%d wind=%d house=%d start=%d gps=%d heading=%d water=%d solar=%d",
                             readiness_state.signalk_clock.valid,
                             readiness_state.true_wind_speed_mps.valid ||
                                 readiness_state.apparent_wind_speed_mps.valid,
                             readiness_state.house_battery_voltage_v.valid,
                             readiness_state.start_battery_voltage_v.valid,
                             readiness_state.gps_quality.valid,
                             readiness_state.heading_true_rad.valid,
                             readiness_state.fresh_water_level_ratio.valid,
                             readiness_state.solar_panel_power_w.valid);
                }
            }
        }
        break;
    case WEBSOCKET_EVENT_ERROR:
        ESP_LOGW(TAG, "Signal K WebSocket error");
        break;
    default:
        break;
    }
}

static void wifi_event(void *arg, esp_event_base_t base, int32_t event_id,
                       void *event_data)
{
    if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_connected = false;
        signalk_connected = false;
        publish_connections();
        esp_wifi_connect();
        ESP_LOGW(TAG, "Wi-Fi disconnected; retrying");
    } else if (base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        wifi_connected = true;
        publish_connections();
        ESP_LOGI(TAG, "Wi-Fi connected");
        if (websocket != NULL && !esp_websocket_client_is_connected(websocket)) {
            esp_websocket_client_start(websocket);
        }
    }
}

void telemetry_service_start(const runtime_config_t *config)
{
    telemetry_state_init();
    setenv("TZ", CONFIG_KRISHNA_TIMEZONE, 1);
    tzset();

    if (config == NULL || config->signalk_host[0] == '\0' ||
        config->signalk_port == 0) {
        ESP_LOGE(TAG, "Signal K endpoint configuration is invalid");
        return;
    }
    if (strlen(CONFIG_KRISHNA_WIFI_SSID) == 0) {
        ESP_LOGW(TAG, "Wi-Fi is not configured; telemetry remains unavailable");
        return;
    }

    esp_err_t nvs_result = nvs_flash_init();
    if (nvs_result == ESP_ERR_NVS_NO_FREE_PAGES ||
        nvs_result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    } else {
        ESP_ERROR_CHECK(nvs_result);
    }
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t wifi_init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&wifi_init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                               wifi_event, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                               wifi_event, NULL));

    wifi_config_t wifi_config = {0};
    strlcpy((char *)wifi_config.sta.ssid, CONFIG_KRISHNA_WIFI_SSID,
            sizeof(wifi_config.sta.ssid));
    strlcpy((char *)wifi_config.sta.password, CONFIG_KRISHNA_WIFI_PASSWORD,
            sizeof(wifi_config.sta.password));
    wifi_config.sta.threshold.authmode =
        strlen(CONFIG_KRISHNA_WIFI_PASSWORD) == 0 ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK;
    wifi_config.sta.pmf_cfg.capable = true;
    wifi_config.sta.pmf_cfg.required = false;

    char websocket_uri[160];
    snprintf(websocket_uri, sizeof(websocket_uri),
             "ws://%s:%d/signalk/v1/stream?subscribe=none",
             config->signalk_host, config->signalk_port);
    esp_websocket_client_config_t websocket_config = {
        .uri = websocket_uri,
        .reconnect_timeout_ms = 3000,
        .network_timeout_ms = 5000,
    };
    websocket = esp_websocket_client_init(&websocket_config);
    ESP_ERROR_CHECK(websocket == NULL ? ESP_FAIL : ESP_OK);
    ESP_ERROR_CHECK(esp_websocket_register_events(
        websocket, WEBSOCKET_EVENT_ANY, websocket_event, NULL));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "Telemetry configured for Signal K at %s:%d",
             config->signalk_host, config->signalk_port);
}
