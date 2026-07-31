#include "sd_storage.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "cJSON.h"
#include "driver/i2c.h"
#include "driver/sdspi_host.h"
#include "driver/spi_common.h"
#include "esp_app_desc.h"
#include "esp_log.h"
#include "esp_vfs_fat.h"
#include "sdmmc_cmd.h"

#define SD_MOUNT_POINT "/sdcard"
#define SD_CONFIG_PATH SD_MOUNT_POINT "/krishna/config.json"
#define SD_STATUS_PATH SD_MOUNT_POINT "/krishna/boot.txt"
#define SD_PIN_MOSI 11
#define SD_PIN_MISO 13
#define SD_PIN_CLK 12

static const char *TAG = "sd_storage";
static sdmmc_card_t *card;

void runtime_config_defaults(runtime_config_t *config)
{
    memset(config, 0, sizeof(*config));
    strlcpy(config->signalk_host, CONFIG_KRISHNA_SIGNALK_HOST,
            sizeof(config->signalk_host));
    config->signalk_port = CONFIG_KRISHNA_SIGNALK_PORT;
}

static bool load_config(runtime_config_t *config)
{
    FILE *file = fopen(SD_CONFIG_PATH, "r");
    if (file == NULL) {
        ESP_LOGI(TAG, "No SD configuration at %s; using firmware defaults",
                 SD_CONFIG_PATH);
        return false;
    }

    char buffer[768];
    size_t length = fread(buffer, 1, sizeof(buffer) - 1, file);
    fclose(file);
    buffer[length] = '\0';

    cJSON *root = cJSON_ParseWithLength(buffer, length);
    const cJSON *signalk = cJSON_GetObjectItemCaseSensitive(root, "signalk");
    const cJSON *host = cJSON_GetObjectItemCaseSensitive(signalk, "host");
    const cJSON *port = cJSON_GetObjectItemCaseSensitive(signalk, "port");
    bool valid = root != NULL && cJSON_IsObject(signalk) &&
                 cJSON_IsString(host) && host->valuestring[0] != '\0' &&
                 cJSON_IsNumber(port) && port->valueint > 0 &&
                 port->valueint <= 65535;
    if (valid) {
        strlcpy(config->signalk_host, host->valuestring,
                sizeof(config->signalk_host));
        config->signalk_port = (uint16_t)port->valueint;
        config->loaded_from_sd = true;
        ESP_LOGI(TAG, "Loaded Signal K endpoint from SD configuration");
    } else {
        ESP_LOGW(TAG, "Ignoring malformed SD configuration");
    }
    cJSON_Delete(root);
    return valid;
}

static void write_status(const runtime_config_t *config)
{
    if (mkdir(SD_MOUNT_POINT "/krishna", 0775) != 0 && errno != EEXIST) {
        ESP_LOGW(TAG, "Could not create SD runtime directory: errno=%d (%s)",
                 errno, strerror(errno));
        return;
    }
    FILE *file = fopen(SD_STATUS_PATH, "w");
    if (file == NULL) {
        ESP_LOGW(TAG, "Could not write SD boot status: errno=%d (%s)",
                 errno, strerror(errno));
        return;
    }
    const esp_app_desc_t *app = esp_app_get_description();
    fprintf(file, "project=%s\nversion=%s\nsignalk=%s:%u\nconfig_source=%s\n",
            app->project_name, app->version, config->signalk_host,
            config->signalk_port, config->loaded_from_sd ? "sd" : "firmware");
    fclose(file);
    ESP_LOGI(TAG, "Wrote SD boot status to %s", SD_STATUS_PATH);
}

bool sd_storage_mount_and_load(runtime_config_t *config)
{
    sdmmc_host_t host = SDSPI_HOST_DEFAULT();
    spi_bus_config_t bus = {
        .mosi_io_num = SD_PIN_MOSI,
        .miso_io_num = SD_PIN_MISO,
        .sclk_io_num = SD_PIN_CLK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 4096,
    };
    esp_err_t result = spi_bus_initialize(host.slot, &bus, SDSPI_DEFAULT_DMA);
    if (result != ESP_OK && result != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "SD SPI bus initialization failed: %s",
                 esp_err_to_name(result));
        return false;
    }

    /*
     * The Waveshare board routes SD CS through CH422G EXIO4. The official
     * display initialization leaves EXIO4 low in its 0x2E output state, so
     * the SDSPI device uses no direct GPIO CS.
     */
    sdspi_device_config_t slot = SDSPI_DEVICE_CONFIG_DEFAULT();
    slot.gpio_cs = -1;
    slot.host_id = host.slot;
    esp_vfs_fat_sdmmc_mount_config_t mount = {
        .format_if_mount_failed = false,
        .max_files = 5,
        .allocation_unit_size = 16 * 1024,
    };
    result = esp_vfs_fat_sdspi_mount(SD_MOUNT_POINT, &host, &slot, &mount, &card);
    if (result != ESP_OK) {
        ESP_LOGW(TAG, "SD mount failed without formatting: %s",
                 esp_err_to_name(result));
        return false;
    }

    uint64_t capacity_mb =
        ((uint64_t)card->csd.capacity * card->csd.sector_size) / (1024 * 1024);
    ESP_LOGI(TAG, "SD mounted: %llu MiB", (unsigned long long)capacity_mb);
    load_config(config);
    write_status(config);
    return true;
}
