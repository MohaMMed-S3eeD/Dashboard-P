# Dashboard API

API للوحة التحكم مبني بـ Express.js و TypeScript.

## المتطلبات

- Node.js (18+)
- npm

## التشغيل محلياً

```bash
# تثبيت المكتبات
npm install

# تشغيل في وضع التطوير
npm run dev

# بناء المشروع للإنتاج
npm run build

# تشغيل النسخة المبنية
npm start
```

## النشر على Vercel

### الطريقة الأولى: استخدام Vercel CLI

1. تثبيت Vercel CLI:
```bash
npm i -g vercel
```

2. تسجيل الدخول:
```bash
vercel login
```

3. نشر المشروع:
```bash
vercel --prod
```

### الطريقة الثانية: ربط GitHub مع Vercel

1. ارفع المشروع إلى GitHub
2. اذهب إلى [Vercel Dashboard](https://vercel.com/dashboard)
3. اضغط على "New Project"
4. اختر مستودع GitHub الخاص بك
5. Vercel سيكتشف الإعدادات تلقائياً وينشر المشروع

## البنية

```
dashboard/
├── src/
│   └── index.ts       # الملف الرئيسي للـ API
├── dist/              # ملفات JavaScript المبنية
├── package.json       
├── tsconfig.json      # إعدادات TypeScript
├── vercel.json        # إعدادات Vercel
└── README.md
```

## API Endpoints

- `GET /` - رسالة ترحيب
- `GET /api/health` - فحص حالة الخادم
- `GET /api/users` - جلب جميع المستخدمين
- `GET /api/users/:id` - جلب مستخدم بواسطة ID
- `POST /api/users` - إنشاء مستخدم جديد
- `PUT /api/users/:id` - تحديث مستخدم
- `DELETE /api/users/:id` - حذف مستخدم

## المتغيرات البيئية

- `PORT` - المنفذ المستخدم (افتراضي: 3000)

## ملاحظات مهمة لـ Vercel

- المشروع مُهيأ للعمل مع Node.js runtime في Vercel
- ملف `vercel.json` يحدد كيفية التعامل مع المسارات
- Express app يتم تصديره كـ default export ليعمل مع Vercel
