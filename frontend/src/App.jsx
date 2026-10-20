import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import UploadPage from "./pages/UploadPage";
import ReviewQueuePage from "./pages/ReviewQueuePage";
import InvoiceReviewPage from "./pages/InvoiceReviewPage";
import ExportPage from "./pages/ExportPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<UploadPage />} />
          <Route path="/kiem-tra" element={<ReviewQueuePage />} />
          <Route path="/xuat-excel" element={<ExportPage />} />
        </Route>
        {/* Màn đối chiếu ảnh/JSON dùng toàn màn hình riêng, không chung sidebar */}
        <Route path="/kiem-tra/:id" element={<InvoiceReviewPage />} />
      </Routes>
    </BrowserRouter>
  );
}
