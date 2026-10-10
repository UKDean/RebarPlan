# نشر RebarPlan على Microsoft Store (مجاناً)

- **الحساب:** تسجيل المطوّر الفردي في Microsoft Store مجاني.
- **التوقيع:** مايكروسوفت توقّع التطبيق بنفسها عند النشر، فلا تحتاج شهادة.
- **التحذير:** من يثبّت التطبيق من المتجر لا يرى أي رسالة تحذير.

> إذا طُلب منك أي دفع أثناء التسجيل، توقّف وتأكد، فالتسجيل الفردي يجب أن يكون مجانياً.

**المدة التقريبية:** 30 دقيقة للتسجيل، و20 دقيقة للنشر.

---

## الخطوة 1: إنشاء حساب المطوّر
1. افتح **storedeveloper.microsoft.com** واضغط **Get started** أو **Sign up**.
2. سجّل الدخول بحساب Microsoft (Outlook/Hotmail)، أو أنشئ حساباً.
3. اختر نوع الحساب **Individual** (فرد)، وليس Company.
4. أكمل بياناتك وتحقق الهوية: صورة الهوية أو الجواز وصورة شخصية، حسب ما يطلبه الموقع.
5. اسم الناشر الذي سيظهر في المتجر (Publisher display name): `Omar Mashharawi`.

بعدها تدخل لوحة التحكم على **partner.microsoft.com/dashboard**.

---

## الخطوة 2: حجز اسم التطبيق
**Apps and games** ← **New product** ← **MSIX or PWA app** ← اكتب الاسم **RebarPlan** ← **Reserve product name**.

إذا كان الاسم محجوزاً، جرّب: `RebarPlan – Rebar Cutting`.

---

## الخطوة 3: نسخ هوية التطبيق
داخل صفحة التطبيق: **Product management ← Product identity**. انسخ القيم الثلاث:

| في الصفحة | مثال |
|---|---|
| **Package/Identity/Name** | `12345OmarMashharawi.RebarPlan` |
| **Package/Identity/Publisher** | `CN=1A2B3C4D-5E6F-...` |
| **Package/Properties/PublisherDisplayName** | `Omar Mashharawi` |

---

## الخطوة 4: بناء ملف المتجر (ضغطة زر)
GitHub ← المستودع ← **Actions** ← **Microsoft Store package** ← **Run workflow**:
- الصق القيم الثلاث في الخانات الثلاث، ثم اضغط **Run workflow**.
- بعد حوالي 10 دقائق افتح التشغيل، وحمّل **RebarPlan-MicrosoftStore** من أسفل الصفحة. بداخله ملف `RebarPlan_1.0.0.0.msix`.

(أو أرسل القيم الثلاث لـ Claude وهو يشغّله لك.)

---

## الخطوة 5: تعبئة صفحة المتجر
في Partner Center ← التطبيق ← **Start your submission**:

1. **Pricing and availability:** Free، وكل الأسواق.
2. **Properties:**
   - Category: **Productivity**، والثانوية: **Business**.
   - Privacy policy URL: `https://github.com/UKDean/RebarPlan/blob/main/PRIVACY.md`
   - Website: `https://mashharawi.com/tools/rebarplan/`
   - Support contact: `info@mashharawi.com`
3. **Age ratings:** أكمل الاستبيان. التطبيق لا يحتوي محتوى ولا تواصلاً بين المستخدمين ولا مشتريات، والنتيجة 3+ أو Everyone.
4. **Packages:** اسحب ملف `.msix` من الخطوة 4.
5. **Store listings:**
   - أضف ثلاث لغات: **English** و**Arabic** و**Chinese (Simplified)**.
   - النصوص (الوصف والكلمات المفتاحية) نفسها الموجودة في `docs/APPSTORE.md` لكل لغة.
   - الصور: من مجلد `docs/appstore/screenshots/`. مقاسها 2880×1800، وهو مقبول في ويندوز.
6. **Submission options ← Notes for certification:** الصق التالي:
   > No account or network connection needed. On first launch the app opens a sample bar schedule. Click "Calculate cutting plan" to see the cutting patterns; the sidebar has the workshop sheet, report and settings. Language can be changed at the bottom of the sidebar.
7. اضغط **Submit to the Store**.

**المراجعة:** تأخذ عادة من يوم إلى ثلاثة أيام، ويصلك إيميل عند القبول.

---

## الإصدارات التالية
- ارفع رقم الإصدار في ثلاثة ملفات: `package.json` و`src-tauri/Cargo.toml` و`src-tauri/tauri.conf.json`.
- شغّل **Microsoft Store package** بنفس القيم الثلاث.
- في Partner Center: **Update** ← ارفع ملف .msix الجديد ← **Submit**.
