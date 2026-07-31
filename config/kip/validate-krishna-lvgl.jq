def fail($message):
  error($message);

def widgets:
  [.dashboards[].configuration[]];

if (keys | sort) != ["app", "dashboards", "theme"] then
  fail("top-level keys must be app, dashboards and theme")
elif .app.configVersion != 12 then
  fail("app.configVersion must be 12 for KIP 4.8.0")
elif ([.dashboards[].name] != ["Overview", "Anchor Watch", "Systems"]) then
  fail("profile must contain exactly Overview, Anchor Watch and Systems in that order")
elif ([.dashboards[].configuration[] |
       select(.selector != "widget-host2")] | length) != 0 then
  fail("every dashboard entry must use the KIP Host2 wrapper")
elif ([widgets[] |
       select(.input.widgetProperties.uuid != .id)] | length) != 0 then
  fail("widget id and widgetProperties.uuid must match")
elif ((widgets | map(.id) | length) !=
      (widgets | map(.id) | unique | length)) then
  fail("widget ids must be unique across all dashboards")
elif ([widgets[] |
       select((.x | type) != "number" or
              (.y | type) != "number" or
              (.w | type) != "number" or
              (.h | type) != "number" or
              .x < 0 or .y < 0 or .w < 1 or .h < 1 or
              (.x + .w) > 24 or (.y + .h) > 24)] | length) != 0 then
  fail("all widgets must fit the KIP 24 x 24 grid")
elif ([widgets[].input.widgetProperties.type] -
       ["widget-numeric", "widget-position", "widget-ais-radar",
        "widget-label", "widget-wind-steer"] | length) != 0 then
  fail("artifact contains a widget outside the approved stock read-only set")
elif ([widgets[].input.widgetProperties.type |
       select(test("switch|slider|anchor-alarm|autopilot"))] | length) != 0 then
  fail("artifact contains a control-capable widget")
elif ([widgets[].input.widgetProperties.config |
       .. | objects | select(has("putEnable") and .putEnable != false)] | length) != 0 then
  fail("artifact enables a PUT operation")
else
  {
    valid: true,
    configVersion: .app.configVersion,
    dashboards: [.dashboards[] | {
      name,
      widgets: (.configuration | length),
      gridBottom: ([.configuration[] | (.y + .h)] | max)
    }],
    widgetTypes: ([widgets[].input.widgetProperties.type] | unique)
  }
end
