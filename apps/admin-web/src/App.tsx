
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { Loading } from "./components/Ui";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StudentsPage } from "./pages/StudentsPage";
import { GuardiansPage } from "./pages/GuardiansPage";
import { AcademicsPage, AttendancePage, AuditPage, CardsPage, DevicesPage, SmsPage } from "./pages/CollectionPages";
import { StaffPage } from "./pages/StaffPage";
import { SettingsPage } from "./pages/SettingsPage";

function Protected(){const{user,loading}=useAuth();if(loading)return <Loading/>;return user?<AppLayout/>:<Navigate to="/login" replace/>}
export default function App(){return <Routes><Route path="/login" element={<LoginPage/>}/><Route path="/app" element={<Protected/>}><Route index element={<DashboardPage/>}/><Route path="students" element={<StudentsPage/>}/><Route path="guardians" element={<GuardiansPage/>}/><Route path="academics" element={<AcademicsPage/>}/><Route path="cards" element={<CardsPage/>}/><Route path="attendance" element={<AttendancePage/>}/><Route path="sms" element={<SmsPage/>}/><Route path="devices" element={<DevicesPage/>}/><Route path="staff" element={<StaffPage/>}/><Route path="audit" element={<AuditPage/>}/><Route path="settings" element={<SettingsPage/>}/></Route><Route path="*" element={<Navigate to="/app" replace/>}/></Routes>}
