# LiveCrick

Free, cricket-first live TV and sports app for India. See the PRD for full product requirements.

## Repository layout

```
livecrick/
├── app/              Flutter mobile app (Android and iOS)
├── admin/            Admin placeholder (deployed to Vercel)
├── .github/workflows CI pipelines
└── README.md
```

Planned: `api/` (NestJS backend).

## Flutter app setup

```bash
flutter create --org in.livecrick --platforms android,ios app
```

If `app/` already exists, run `flutter create --org in.livecrick --platforms android,ios .` from inside `app/` and check `git diff` so your `lib/` and `pubspec.yaml` aren't overwritten.

```bash
cd app
flutter pub get
flutter run --dart-define=USE_MOCK=true
```

Against a real API later:

```bash
flutter run --dart-define=USE_MOCK=false --dart-define=API_BASE_URL=https://api-staging.example.com/api/v1
```

## Checks before pushing

```bash
cd app
flutter analyze
flutter test
```

## Vercel (admin)

Set **Root Directory** to `admin` in the Vercel project settings. Leave the framework as "Other" and clear the build command.

## Rights and content policy

Only play streams with documented distribution rights. Never commit stream URLs, DRM keys, or API secrets. The mock channel URL is Apple's public sample stream and is for development only.
