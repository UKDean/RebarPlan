# نشر RebarPlan على Mac App Store وتوقيع نسخة الماك

دليل لصاحب حساب Apple Developer (يزن). كل شيء في المستودع جاهز. المطلوب منك فقط الشهادات وأسرار GitHub، ثم ضغطة زر.

**المدة التقريبية:** 45 دقيقة، مرة واحدة فقط. الإصدارات التالية تحتاج ضغطة زر فقط.

---

## الخطوة 0: الدخول للمستودع
عمر يضيفك كمتعاون (Collaborator) على **github.com/UKDean/RebarPlan**. اقبل الدعوة من الإيميل.

---

## الخطوة 1: طلب الشهادة (CSR) على جهازك
1. افتح **Keychain Access** (الوصول إلى سلسلة المفاتيح).
2. من القائمة اختر: Keychain Access ← Certificate Assistant ← **Request a Certificate From a Certificate Authority**.
3. اكتب إيميلك واسمك، واختر **Saved to disk**، واحفظ الملف `CertificateSigningRequest.certSigningRequest`.

---

## الخطوة 2: الشهادات الثلاث
ادخل **developer.apple.com/account** ← Certificates ← زر **+**. أنشئ الشهادات التالية، كل واحدة بنفس ملف CSR:

| الشهادة | لماذا |
|---|---|
| **Apple Distribution** | توقيع نسخة App Store |
| **Mac Installer Distribution** | توقيع ملف التثبيت .pkg الذي يُرفع للمتجر |
| **Developer ID Application** (اختر G2 Sub-CA) | توقيع ملف dmg الذي يُحمَّل من الموقع (يزيل التحذير) |

حمّل كل ملف `.cer`، واضغط عليه مرتين ليدخل Keychain.

---

## الخطوة 3: App ID وملف التعريف
1. **Identifiers ← +** ← App IDs ← App ← المنصة **macOS**:
   - Description: `RebarPlan`
   - Bundle ID (Explicit): **`com.mashharawi.rebarplan`**
   - بدون Capabilities إضافية.
2. **Profiles ← +** ← تحت Distribution اختر **Mac App Store Connect**:
   - اختر App ID السابق، ثم شهادة **Apple Distribution**.
   - الاسم: `RebarPlan App Store`، ثم حمّل الملف `.provisionprofile`.

---

## الخطوة 4: مفتاح App Store Connect API
**appstoreconnect.apple.com** ← Users and Access ← **Integrations** ← App Store Connect API ← Team Keys ← زر **+**:
- الاسم: `RebarPlan CI`، والصلاحية: **App Manager**.
- احفظ **Issuer ID** (أعلى الصفحة) و**Key ID**.
- حمّل ملف `AuthKey_XXXX.p8`. **يُحمَّل مرة واحدة فقط**، فاحفظه في مكان آمن.

---

## الطريقة الأسهل (موصى بها): البناء والرفع من جهازك مباشرة
بعد الخطوات 1 إلى 4، الشهادات موجودة في Keychain على جهازك. نزّل المستودع وشغّل السكربت، والمفاتيح لا تغادر جهازك أبداً.

**مرة واحدة: تجهيز الأدوات**
```bash
xcode-select --install                     # إذا لم تكن مثبتة
brew install node@22 rustup && rustup-init -y
rustup target add aarch64-apple-darwin x86_64-apple-darwin
git clone https://github.com/UKDean/RebarPlan.git && cd RebarPlan
```

**نسخة App Store:**
```bash
scripts/macos-release.sh appstore TEAM_ID ~/Downloads/RebarPlan_App_Store.provisionprofile
```
- النتيجة: ملف `dist/RebarPlan-AppStore.pkg`، موقّع وجاهز.
- الرفع: افتح تطبيق **Transporter** (مجاني من Mac App Store)، سجّل الدخول، واسحب الملف إليه، ثم اضغط **Deliver**.
- بعدها أكمل من الخطوة 7 (صفحة التطبيق) ثم أرسل للمراجعة.

**نسخة الموقع موقّعة وموثّقة (بدون تحذير):**
```bash
APPLE_ID=your@icloud.com APPLE_PASSWORD=xxxx-xxxx-xxxx-xxxx scripts/macos-release.sh developer-id TEAM_ID
```
- `APPLE_PASSWORD`: كلمة سر خاصة بالتطبيقات، تُنشأ من **appleid.apple.com** ← Sign-In and Security ← App-Specific Passwords.
- النتيجة: ملف dmg في مجلد `dist/`. أرسله لعمر، أو ارفعه مكان القديم في صفحة الإصدار على GitHub.

**الطريقة الثانية: الأسرار في GitHub**
الخطوتان 5 و6 تحتاجان صاحب المستودع (عمر)، لأن GitHub لا يسمح للمتعاون بإضافة أسرار في مستودع شخصي. استخدمها فقط إذا أردتم أن يتم البناء على GitHub بدل جهازك.

## الخطوة 5: تصدير الشهادات لملفات p12
في **Keychain Access** ← My Certificates:
1. حدّد **Apple Distribution** و**Mac Installer Distribution** معاً، ثم زر يمين ← **Export 2 items** ← احفظ باسم `appstore.p12`، واختر كلمة سر.
2. حدّد **Developer ID Application** وحدها ← Export ← احفظ باسم `developerid.p12`، واختر كلمة سر.

حوّل الملفات لنص بهذا الأمر في Terminal. كل أمر ينسخ النتيجة، فالصقها مباشرة في GitHub في الخطوة 6:
```bash
base64 -i appstore.p12 | tr -d '\n' | pbcopy        # APPSTORE_CERTIFICATES_P12
base64 -i developerid.p12 | tr -d '\n' | pbcopy     # DEVELOPER_ID_CERTIFICATE_P12
base64 -i "RebarPlan_App_Store.provisionprofile" | tr -d '\n' | pbcopy   # APPSTORE_PROVISION_PROFILE
pbcopy < AuthKey_XXXX.p8                            # APPLE_API_PRIVATE_KEY
```

---

## الخطوة 6: أسرار GitHub
**يضيفها عمر** (صاحب المستودع): المستودع ← **Settings ← Secrets and variables ← Actions ← New repository secret**. أضف التسعة:

| الاسم | القيمة |
|---|---|
| `APPLE_TEAM_ID` | Team ID من صفحة Membership (10 حروف) |
| `APPSTORE_CERTIFICATES_P12` | نص appstore.p12 |
| `APPSTORE_CERTIFICATES_PASSWORD` | كلمة سر appstore.p12 |
| `APPSTORE_PROVISION_PROFILE` | نص ملف provisionprofile |
| `APPLE_API_ISSUER` | Issuer ID |
| `APPLE_API_KEY_ID` | Key ID |
| `APPLE_API_PRIVATE_KEY` | محتوى ملف .p8 كما هو |
| `DEVELOPER_ID_CERTIFICATE_P12` | نص developerid.p12 |
| `DEVELOPER_ID_CERTIFICATE_PASSWORD` | كلمة سر developerid.p12 |

بعد الإضافة احذف ملفات p12 وp8 من سطح المكتب. الأسرار في GitHub مشفّرة، ولا يراها أحد حتى عمر.

---

## الخطوة 7: صفحة التطبيق في App Store Connect
**Apps ← + ← New App**:
- **Platform:** macOS
- **Name:** `RebarPlan`. إذا كان الاسم محجوزاً: `RebarPlan – Rebar Cutting`
- **Primary Language:** English
- **Bundle ID:** com.mashharawi.rebarplan
- **SKU:** `rebarplan-mac`

ثم املأ التالي. النصوص جاهزة في القسم التالي:
- **App Information:**
  - Category: **Productivity**، والثانوية: **Business**.
  - أضف اللغتين **Arabic** و**Chinese (Simplified)** من قائمة اللغات أعلى الصفحة، والصق نص كل لغة.
- **Pricing and Availability:** Free، وكل الدول.
- **App Privacy:** Get Started ← **No, we do not collect data from this app**.
- **Age Rating:** أجب No/None على كل الأسئلة، والنتيجة 4+.
- **صفحة الإصدار 1.0:**
  - الصق النصوص.
  - ارفع الصور من مجلد `docs/appstore/screenshots/`: الصور `en-*` للإنجليزي، و`ar-*` للعربي، و`zh-*` للصيني. مقاسها 2880×1800، وهو مقاس يقبله المتجر.
  - Support URL: `https://mashharawi.com/tools/rebarplan/`
  - Privacy Policy URL: `https://github.com/UKDean/RebarPlan/blob/main/PRIVACY.md`
  - Copyright: `2026 Omar Mashharawi`
- **App Review Information:**
  - Sign-in required: **No**.
  - Notes: الصق النص الموجود في «ملاحظات للمراجع» أدناه.

---

## الخطوة 8: البناء والرفع (ضغطة زر)
المستودع ← **Actions** ← **Mac App Store upload** ← **Run workflow**.
- **المدة:** حوالي 15 دقيقة. يبني التطبيق ويوقّعه ويرفعه تلقائياً.
- **بعد الرفع:** تحتاج النسخة 10 إلى 30 دقيقة حتى تظهر في App Store Connect، داخل صفحة الإصدار في قسم Build.
- **الإرسال:** اختر النسخة، ثم **Add for Review**، ثم **Submit**.

**إذا فشل البناء:** افتح التشغيل الفاشل، فرسالة الخطأ تقول أي سر ناقص أو أي شهادة غير موجودة.

---

## الخطوة 9: نسخة الموقع موقّعة (اختياري، بعد الخطوة 6)
لكي يُفتح ملف dmg المحمَّل من الموقع بدون أي تحذير:
```bash
git tag v1.0.1 && git push origin v1.0.1
```
قبل ذلك ارفع رقم الإصدار إلى 1.0.1 في ثلاثة ملفات: `package.json` و`src-tauri/Cargo.toml` و`src-tauri/tauri.conf.json`.

سير العمل **Build installers** يوقّع نسخة الماك بشهادة Developer ID، ويرسلها لـ Apple للتوثيق (Notarization) تلقائياً.

---

# نصوص المتجر

## English
- **Name:** RebarPlan
- **Subtitle (30):** Bar schedule & cutting plan
- **Promotional text (170):** Turn a bar bending schedule into weights per diameter and the cutting plan that uses the fewest 12 m bars. Arabic, English and Chinese. Works offline.
- **Keywords (100):** rebar,BBS,bar bending schedule,cutting,steel,construction,BS 8666,ACI,estimating,waste,optimizer
- **Description:**

RebarPlan puts a bar bending schedule and a rebar cutting plan in one app.

Enter your bar marks by shape and dimensions, or import the schedule from Excel. RebarPlan works out every cut length, the weight per diameter, and how to cut the job from stock bars with the least waste.

SCHEDULE
• Cut lengths to BS 8666:2005 (shape codes 00, 11, 21, 51) or ACI 318 / Saudi SBC 304
• Legs shorter than the BS 8666 minimum are flagged
• Pieces, metres and kilograms for each diameter

CUTTING PLAN
• Cutting patterns per diameter from 12 m bars, or any mix of 6, 9, 12 and 18 m
• Tested to stay within one bar of the theoretical minimum
• Reusable offcuts and scrap shown for every pattern

COST
• Enter a price per tonne to see the steel cost and what the plan saves against cutting each mark on its own

WORKSHOP
• A printable cutting list for the operator, and a label for every bundle

EXPORT
• Excel (schedule, summary by diameter, cutting plan), PDF, or a new email with the file attached

PRIVATE
• Runs entirely on your Mac. No account, no tracking, no ads.

Results are for planning and estimating. Check cut lengths with the engineer of record before cutting steel. Free and open source.

## العربية
- **الاسم:** RebarPlan
- **العنوان الفرعي (30):** جدول التفريد وخطة قص الحديد
- **النص الترويجي (170):** حوّل جدول تفريد الحديد إلى أوزان لكل قطر وخطة قص بأقل عدد من أسياخ 12 م. بالعربية والإنجليزية والصينية، ويعمل بدون إنترنت.
- **الكلمات المفتاحية (100):** حديد,تسليح,تفريد,قص,حديد تسليح,مقاولات,هدر,حاسبة,أسياخ,BBS,خرسانة
- **الوصف:**

RebarPlan يجمع جدول تفريد الحديد وخطة القص في تطبيق واحد.

أدخل العلامات بالأشكال والأبعاد أو استوردها من Excel، فيحسب طول القص لكل علامة، والوزن لكل قطر، وأفضل طريقة لقص المشروع من الأسياخ بأقل هدر.

جدول التفريد
• أطوال القص حسب BS 8666:2005 (الأشكال 00 و11 و21 و51) أو ACI 318 والكود السعودي SBC 304
• تنبيه عند أي ضلع أقصر من الحد الأدنى في BS 8666
• عدد القطع والأمتار والكيلوجرامات لكل قطر

خطة القص
• أنماط قص لكل قطر من أسياخ 12 م أو خليط من 6 و9 و12 و18 م
• مختبَرة ألا تزيد عن الحد الأدنى النظري بأكثر من سيخ واحد
• البواقي القابلة لإعادة الاستخدام والسكراب لكل نمط

التكلفة
• أدخل سعر الطن لترى تكلفة الحديد وكم وفّرت الخطة بالريال

الورشة
• قائمة قص جاهزة للطباعة لعامل القص، وملصق لكل حزمة

التصدير
• Excel وPDF، أو رسالة إيميل جديدة والملف مرفق

الخصوصية
• يعمل بالكامل على جهازك. بدون حساب أو تتبع أو إعلانات.

النتائج للتخطيط والتقدير. راجع أطوال القص مع المهندس المسؤول قبل قص الحديد. مجاني ومفتوح المصدر.

## 简体中文
- **名称:** RebarPlan
- **副标题 (30):** 钢筋下料表与切割方案
- **推广文本 (170):** 将钢筋下料表转换为按直径汇总的重量，并生成使用最少 12 米原材的切割方案。支持阿拉伯语、英语和中文，可离线使用。
- **关键词 (100):** 钢筋,下料,下料表,切割,优化,钢材,施工,损耗,BS 8666,ACI
- **描述:**

RebarPlan 将钢筋下料表和切割方案集于一个应用。

按形状和尺寸输入钢筋编号，或从 Excel 导入下料表。RebarPlan 会计算每个编号的下料长度、每种直径的重量，以及损耗最少的原材切割方式。

下料表
• 按 BS 8666:2005（形状代码 00、11、21、51）或 ACI 318 / 沙特 SBC 304 计算下料长度
• 小于 BS 8666 最小值的边长会被标出
• 每种直径的件数、米数和公斤数

切割方案
• 按直径从 12 米原材或 6、9、12、18 米混合原材生成切割方案
• 经测试，与理论最少根数相差不超过一根
• 显示每种方案的可再利用余料和废料

成本
• 输入每吨价格，查看钢材成本及方案节省的金额

车间
• 可打印的切割清单和每捆标签

导出
• Excel、PDF，或直接生成附带文件的新邮件

隐私
• 完全在您的 Mac 上运行，无需账户，无跟踪，无广告。

结果仅供计划与估算，下料前请与负责工程师核对。免费开源。

---

## ملاحظات للمراجع (App Review Notes)
> RebarPlan needs no account and no network connection. On first launch it opens a sample bar schedule. Press "Calculate cutting plan" (top right) to see the cutting patterns, and use the sidebar for the workshop sheet, report and settings. The interface language can be switched at the bottom of the sidebar (Arabic, English, Chinese). File access is limited to files the user picks in open/save dialogs.
