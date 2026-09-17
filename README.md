# LuaProtect

Bảo vệ script Lua / Roblox:

1. Dán script + đặt mật khẩu → nhận 2 link  
2. **Link xem** (`/s/ID`): mở trên trình duyệt → **bắt buộc nhập mật khẩu** mới thấy code  
3. **Raw URL** (`/raw/ID?key=...`): dùng trong Roblox `HttpGet` + `loadstring` → **chạy bình thường**, không hỏi mật khẩu  

## Chạy

```bash
cd lua-protect
npm install
npm start
```

Mở: http://localhost:3000

## Roblox

```lua
loadstring(game:HttpGet("https://YOUR_HOST/raw/ID?key=RAW_KEY"))()
```

## Cấu trúc

```
lua-protect/
├── package.json
├── server.js
├── README.md
├── public/
│   ├── index.html    # trang tạo link
│   └── view.html     # trang nhập mật khẩu
├── data/             # metadata (tự tạo)
└── scripts/          # file .lua (tự tạo)
```

## Lưu ý

- Đây là bảo vệ **chia sẻ**, không phải mã hóa tuyệt đối.  
- Ai có **raw URL + key** vẫn lấy được script.  
- Không public raw URL nếu không muốn lộ code.  
- Deploy: Render / Railway / VPS (giống app Node thông thường).
