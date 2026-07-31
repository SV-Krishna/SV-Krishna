idf_component_register(
    SRCS "waveshare_rgb_lcd_port.c" "main.c" "lvgl_port.c"
         "telemetry/signalk_delta.c"
         "telemetry/sd_storage.c"
         "telemetry/telemetry_service.c"
         "telemetry/telemetry_state.c"
         "ui/overview_screen.c"
         "ui/anchor_watch_screen.c"
    INCLUDE_DIRS "."
    PRIV_REQUIRES esp_app_format esp_event esp_netif esp_wifi fatfs json nvs_flash sdmmc)

idf_component_get_property(lvgl_lib lvgl__lvgl COMPONENT_LIB)
target_compile_options(${lvgl_lib} PRIVATE -Wno-format)
