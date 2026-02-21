# Shrub: Stray Hub

A centralized, computer vision-powered platform to coordinate catch-and-release efforts for stray animals.

## The Problem

Overlapping rescue operations frequently result in the redundant capture of strays that have already been sterilized or vaccinated. Inconsistent identification methods — ear-tipping, paper records, scattered databases — make it nearly impossible for field workers to know an animal's treatment history on the spot.

This is a widespread issue in many regions. In Puerto Rico, for example, fragmented coordination between veterinary clinics and rescue organizations means limited resources are constantly stretched by avoidable repeat interventions.

## The Solution

Shrub gives veterinary clinics a way to create biometric profiles for treated animals using multi-angle photos and medical data. When a field worker encounters a stray, they snap a photo in the app. An AI-powered vector similarity search instantly surfaces the closest matches from the database, and a human-in-the-loop verification step confirms the result.

## How It Works

1. **Clinic intake** — A vet clinic photographs a stray from multiple angles and logs its medical data (vaccinations, sterilization status, etc.), creating a biometric profile.
2. **Field identification** — A rescue worker snaps a photo of a stray animal in the field.
3. **AI matching** — The app runs a vector similarity search against existing profiles and returns the top-ranked visual matches.
4. **Human verification** — The worker confirms or dismisses the match, determining the animal's treatment status on the spot.

## Goals

- Eliminate redundant captures of already-treated animals
- Conserve limited veterinary resources
- Reduce unnecessary stress on the stray animal population
- Provide a single source of truth for rescue organizations

## Tech Stack

- **Mobile:** Expo / React Native
- **Backend:** Firebase Cloud Functions (TypeScript, Node 18)
- **Database:** Cloud Firestore
- **Storage:** Firebase Cloud Storage
- **ML:** Python (vector embeddings + similarity search)

## Contributing

This project is in early development. Contributions, ideas, and feedback are welcome — open an issue to start the conversation.

## License

MIT
