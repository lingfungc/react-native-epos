import { View } from "react-native";
import EventsScreen from "./events";

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <EventsScreen />
    </View>
  );
}
