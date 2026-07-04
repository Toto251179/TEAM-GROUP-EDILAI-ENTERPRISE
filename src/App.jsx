import MainLayout from "./components/Layout/MainLayout";
import AppRouter from "./router/AppRouter";

export default function App() {
  return (
    <MainLayout>
      <AppRouter />
    </MainLayout>
  );
}