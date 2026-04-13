import { MapView } from "./components/MapView";
import { Sidebar } from "./components/Sidebar";
import { Legend } from "./components/Legend";

export function App() {
  return (
    <div className="app">
      <Sidebar />
      <MapView />
      <Legend />
    </div>
  );
}
