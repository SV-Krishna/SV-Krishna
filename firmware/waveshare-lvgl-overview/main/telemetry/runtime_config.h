#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    char signalk_host[96];
    uint16_t signalk_port;
    bool loaded_from_sd;
} runtime_config_t;

void runtime_config_defaults(runtime_config_t *config);
