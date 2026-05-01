import { Tabs } from "expo-router";
import { palette, fontSize } from "@mushroom-map/tokens/native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.light.chanterelle,
        tabBarInactiveTintColor: palette.light.inkDim,
        tabBarStyle: {
          backgroundColor: palette.light.paperRise,
          borderTopColor: palette.light.rule,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Карта" }} />
      <Tabs.Screen name="spots" options={{ title: "Споты" }} />
      <Tabs.Screen name="species" options={{ title: "Виды" }} />
      <Tabs.Screen name="settings" options={{ title: "Настройки" }} />
    </Tabs>
  );
}
