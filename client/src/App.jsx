import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import AuctionRoomPage from "./pages/AuctionRoomPage";
import MatchSimulationPage from "./pages/MatchSimulationPage";
import RoomLobbyPage from "./pages/RoomLobbyPage";
import StandingsPage from "./pages/StandingsPage";
import TeamManagementPage from "./pages/TeamManagementPage";

function Layout({ children }) {
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout>
            <RoomLobbyPage />
          </Layout>
        }
      />
      <Route
        path="/room"
        element={
          <Layout>
            <RoomLobbyPage />
          </Layout>
        }
      />
      <Route
        path="/auction/:roomId"
        element={
          <Layout>
            <AuctionRoomPage />
          </Layout>
        }
      />
      <Route
        path="/team"
        element={
          <Layout>
            <TeamManagementPage />
          </Layout>
        }
      />
      <Route
        path="/match"
        element={
          <Layout>
            <MatchSimulationPage />
          </Layout>
        }
      />
      <Route
        path="/standings"
        element={
          <Layout>
            <StandingsPage />
          </Layout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
