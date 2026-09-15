# رفع المشروع على GitHub واستضافته مجانًا

## 1) إنشاء المستودع (Repository)
1. سجّلي دخول على https://github.com (أنشئي حساب مجاني إذا ما عندك).
2. اضغطي **New repository** (الزر الأخضر أو + بالأعلى).
3. اسم المستودع: `hiba-archive` (أو أي اسم تحبيه) — اجعليه **Private** إذا بدك يبقى خاص فيكِ فقط.
4. لا تفعّلي "Add a README file" (عندنا واحد جاهز) واضغطي **Create repository**.

## 2) رفع الملفات (طريقتان)

### الطريقة الأسهل (بدون Terminal)
في صفحة المستودع الفارغ، اضغطي **uploading an existing file**، ثم اسحبي كل الملفات
(`index.html`, `styles.css`, `app.js`, `firebase-config.js`, `README.md`, وغيرها) وأفلتيها،
ثم اضغطي **Commit changes**.

### الطريقة عبر Terminal (إذا مرتاحة فيها)
داخل مجلد المشروع على جهازك:
```bash
git init
git add .
git commit -m "أول نسخة من أرشيفي"
git branch -M main
git remote add origin https://github.com/USERNAME/hiba-archive.git
git push -u origin main
```
استبدلي `USERNAME` باسم حسابك على GitHub.

## 3) تفعيل الاستضافة المجانية (GitHub Pages)
1. من صفحة المستودع: **Settings → Pages**.
2. تحت "Build and deployment" اختاري Source: **Deploy from a branch**.
3. اختاري الفرع `main` والمجلد `/ (root)`، ثم **Save**.
4. بعد دقيقة أو دقيقتين، رح يظهر لك رابط بالشكل:
   `https://USERNAME.github.io/hiba-archive/`
   هذا هو رابط موقعك النهائي — شاركيه أو ثبتيه كأنه تطبيق.

## تحديث الموقع لاحقًا
أي تعديل على الملفات، ارفعيه بنفس طريقة الرفع (drag & drop) أو:
```bash
git add .
git commit -m "تحديث"
git push
```
GitHub Pages بيحدّث الموقع تلقائيًا خلال دقيقة أو دقيقتين من كل رفع.
