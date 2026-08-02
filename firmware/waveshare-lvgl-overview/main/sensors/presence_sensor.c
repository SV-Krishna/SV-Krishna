#include "presence_sensor.h"

#include <stdbool.h>
#include <stdint.h>

#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "presence_filter.h"
#include "sdkconfig.h"

static const char *TAG = "presence";

#define PRESENCE_POLL_MS 50U
#define PRESENCE_DIAGNOSTIC_MS 5000U

typedef struct {
    presence_sensor_callback_t callback;
    void *callback_context;
} presence_sensor_context_t;

static presence_sensor_context_t sensor_context;

static void report_presence(bool present)
{
    if (sensor_context.callback != NULL) {
        sensor_context.callback(present, sensor_context.callback_context);
    }
}

static void presence_sensor_task(void *context)
{
    (void)context;
    presence_filter_t filter = {0};
    bool stable = false;
    bool raw = gpio_get_level(CONFIG_KRISHNA_PRESENCE_GPIO) != 0;
    uint32_t now_ms = (uint32_t)(esp_timer_get_time() / 1000);
    uint32_t last_diagnostic_ms = now_ms;

    presence_filter_init(&filter, raw, now_ms);
    stable = raw;
    ESP_LOGI(TAG, "LD2410C initial state: %s", raw ? "PRESENT" : "CLEAR");
    report_presence(raw);

    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(PRESENCE_POLL_MS));
        raw = gpio_get_level(CONFIG_KRISHNA_PRESENCE_GPIO) != 0;
        now_ms = (uint32_t)(esp_timer_get_time() / 1000);
        if (presence_filter_update(&filter, raw, now_ms,
                                   CONFIG_KRISHNA_PRESENCE_DEBOUNCE_MS,
                                   &stable)) {
            ESP_LOGI(TAG, "LD2410C presence changed: %s",
                     stable ? "PRESENT" : "CLEAR");
            report_presence(stable);
        }
        if ((uint32_t)(now_ms - last_diagnostic_ms) >=
            PRESENCE_DIAGNOSTIC_MS) {
            ESP_LOGI(TAG, "LD2410C diagnostic: raw=%d stable=%s",
                     raw, stable ? "PRESENT" : "CLEAR");
            last_diagnostic_ms = now_ms;
        }
    }
}

esp_err_t presence_sensor_start(presence_sensor_callback_t callback,
                                void *callback_context)
{
    sensor_context.callback = callback;
    sensor_context.callback_context = callback_context;

    const gpio_config_t config = {
        .pin_bit_mask = 1ULL << CONFIG_KRISHNA_PRESENCE_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_ENABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    esp_err_t err = gpio_config(&config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to configure GPIO%d: %s",
                 CONFIG_KRISHNA_PRESENCE_GPIO, esp_err_to_name(err));
        return err;
    }

    if (xTaskCreate(presence_sensor_task, "presence_sensor", 3072, NULL, 4,
                    NULL) != pdPASS) {
        ESP_LOGE(TAG, "Failed to create presence sensor task");
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "LD2410C OUT monitoring started on GPIO%d (%d ms debounce)",
             CONFIG_KRISHNA_PRESENCE_GPIO,
             CONFIG_KRISHNA_PRESENCE_DEBOUNCE_MS);
    return ESP_OK;
}
