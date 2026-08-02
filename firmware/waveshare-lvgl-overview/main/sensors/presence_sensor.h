#pragma once

#include <stdbool.h>

#include "esp_err.h"

typedef void (*presence_sensor_callback_t)(bool present, void *context);

esp_err_t presence_sensor_start(presence_sensor_callback_t callback,
                                void *callback_context);
