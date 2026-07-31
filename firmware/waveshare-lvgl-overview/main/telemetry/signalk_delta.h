#pragma once

#include <stddef.h>
#include <stdint.h>

size_t signalk_delta_apply(const char *payload, size_t length, int64_t received_ms);
