#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    bool initialized;
    bool stable_value;
    bool candidate_value;
    uint32_t candidate_since_ms;
} presence_filter_t;

void presence_filter_init(presence_filter_t *filter, bool initial_value,
                          uint32_t now_ms);

bool presence_filter_update(presence_filter_t *filter, bool sample,
                            uint32_t now_ms, uint32_t debounce_ms,
                            bool *stable_value);
