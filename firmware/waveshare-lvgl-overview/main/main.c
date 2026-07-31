/*
 * SPDX-FileCopyrightText: 2023-2024 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: CC0-1.0
 */

#include "waveshare_rgb_lcd_port.h"
#include "telemetry/sd_storage.h"
#include "telemetry/telemetry_service.h"
#include "ui/overview_screen.h"
#include "ui/anchor_watch_screen.h"

void app_main()
{
    waveshare_esp32_s3_rgb_lcd_init();

    runtime_config_t runtime_config;
    runtime_config_defaults(&runtime_config);
    sd_storage_mount_and_load(&runtime_config);
    telemetry_service_start(&runtime_config);

    ESP_LOGI(TAG, "Starting Krishna marine Overview");
    if (lvgl_port_lock(-1)) {
        krishna_overview_create();
        krishna_anchor_watch_create();
        lvgl_port_unlock();
    }
}
