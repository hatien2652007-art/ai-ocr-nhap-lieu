-- Chạy đoạn SQL này trong Supabase: Project > SQL Editor > New query > Run.
-- Chạy lại nhiều lần vẫn an toàn (dùng "if not exists").
-- Tạo bảng lưu hóa đơn bán hàng đã OCR, khớp schema/hoa-don-ban-hang.schema.json.

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- processing | needs_review | ready | reviewed | exported | error
  status text not null default 'processing',

  -- File gốc: tên hiển thị, loại file, đường dẫn trong bucket "invoice-files"
  file_name text not null,
  mime_type text,
  storage_path text,

  -- Dữ liệu OCR trích xuất được, đúng cấu trúc hoa-don-ban-hang.schema.json
  data jsonb,

  -- Độ tin cậy tổng thể (0-1), dưới 0.7 thì vào hàng cần kiểm tra lại
  overall_confidence numeric,

  -- Cảnh báo từ kiểm tra số học/thiếu field (mảng chuỗi tiếng Việt)
  warnings jsonb not null default '[]'::jsonb,

  -- Lỗi khi Gemini xử lý thất bại, hiển thị cho người dùng
  error_message text
);

-- Bổ sung cột nếu bảng đã được tạo từ bản SQL cũ
alter table invoices add column if not exists updated_at timestamptz not null default now();
alter table invoices add column if not exists mime_type text;
alter table invoices add column if not exists warnings jsonb not null default '[]'::jsonb;

create index if not exists invoices_status_idx on invoices (status);
create index if not exists invoices_created_at_idx on invoices (created_at desc);

-- Tự cập nhật updated_at mỗi lần sửa dòng
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists invoices_set_updated_at on invoices;
create trigger invoices_set_updated_at
  before update on invoices
  for each row execute function set_updated_at();

-- Bật Row Level Security, không tạo policy nào: chặn hoàn toàn truy cập trực tiếp
-- bằng publishable/anon key. Chỉ backend (dùng secret/service_role key) đọc ghi được.
alter table invoices enable row level security;

-- Bucket private lưu ảnh/PDF gốc. Frontend xem ảnh qua signed URL do backend cấp.
insert into storage.buckets (id, name, public)
values ('invoice-files', 'invoice-files', false)
on conflict (id) do nothing;
