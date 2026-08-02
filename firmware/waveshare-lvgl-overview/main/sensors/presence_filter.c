#include "presence_filter.h"

void presence_filter_init(presence_filter_t *filter, bool initial_value,
                          uint32_t now_ms)
{
    filter->initialized = true;
    filter->stable_value = initial_value;
    filter->candidate_value = initial_value;
    filter->candidate_since_ms = now_ms;
}

bool presence_filter_update(presence_filter_t *filter, bool sample,
                            uint32_t now_ms, uint32_t debounce_ms,
                            bool *stable_value)
{
    if (!filter->initialized) {
        presence_filter_init(filter, sample, now_ms);
        *stable_value = sample;
        return false;
    }

    if (sample != filter->candidate_value) {
        filter->candidate_value = sample;
        filter->candidate_since_ms = now_ms;
    }

    if (filter->candidate_value != filter->stable_value &&
        (uint32_t)(now_ms - filter->candidate_since_ms) >= debounce_ms) {
        filter->stable_value = filter->candidate_value;
        *stable_value = filter->stable_value;
        return true;
    }

    *stable_value = filter->stable_value;
    return false;
}
