#include <assert.h>
#include <stdbool.h>
#include <stdio.h>

#include "sensors/presence_filter.h"

static void test_requires_stable_candidate_for_debounce_period(void)
{
    presence_filter_t filter = {0};
    bool value = false;
    presence_filter_init(&filter, false, 1000);

    assert(!presence_filter_update(&filter, true, 1100, 250, &value));
    assert(!value);
    assert(!presence_filter_update(&filter, true, 1349, 250, &value));
    assert(!value);
    assert(presence_filter_update(&filter, true, 1350, 250, &value));
    assert(value);
    assert(!presence_filter_update(&filter, true, 1500, 250, &value));
    assert(value);
}

static void test_bounce_restarts_candidate_period(void)
{
    presence_filter_t filter = {0};
    bool value = false;
    presence_filter_init(&filter, false, 0);

    assert(!presence_filter_update(&filter, true, 10, 100, &value));
    assert(!presence_filter_update(&filter, false, 50, 100, &value));
    assert(!presence_filter_update(&filter, true, 80, 100, &value));
    assert(!presence_filter_update(&filter, true, 179, 100, &value));
    assert(presence_filter_update(&filter, true, 180, 100, &value));
    assert(value);
}

static void test_millisecond_counter_wrap(void)
{
    presence_filter_t filter = {0};
    bool value = false;
    presence_filter_init(&filter, false, 0xfffffff0U);

    assert(!presence_filter_update(&filter, true, 0xfffffff5U, 20, &value));
    assert(presence_filter_update(&filter, true, 9U, 20, &value));
    assert(value);
}

int main(void)
{
    test_requires_stable_candidate_for_debounce_period();
    test_bounce_restarts_candidate_period();
    test_millisecond_counter_wrap();
    puts("presence_filter_test: PASS");
    return 0;
}
