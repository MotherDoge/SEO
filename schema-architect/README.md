# Schema Architect

**Schema Architect** is an AI-powered structured data and Schema.org markup generator. Built using Vite, React, TypeScript, and Google Gemini API via Google AI Studio, it streamlines the creation, validation, and optimization of JSON-LD schemas for modern SEO and Answer Engine Optimization (AEO).

---

## Features

- **AI-Powered Schema Generation:** Automatically generates standards-compliant JSON-LD markup for various Schema.org types (e.g., Article, Organization, Product, FAQ, LocalBusiness, HowTo).
- **Validation & Best Practices:** Ensures schema structures align with Google Search documentation and rich result standards.
- **Fast & Lightweight:** Built on Vite and React with Tailwind CSS and Radix/shadcn UI components.
- **Full TypeScript Support:** Strongly typed components and data handling for reliable development.

---

## Tech Stack

- **Framework:** React + Vite
- **Language:** TypeScript
- **Styling & UI:** Tailwind CSS, Radix UI / `shadcn/ui`, Lucide Icons
- **AI Integration:** Google Gemini API via `@google/genai` SDK
- **Runtime / Package Management:** Node.js (v18+) / npm / Bun

---

## Getting Started

### Prerequisites

- **Node.js** (v18.0.0 or later) or **Bun**
- A **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)

---

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/MotherDoge/SEO.git](https://github.com/MotherDoge/SEO.git)
   cd SEO/schema-architect


2. **Install dependencies:**

   npm install
   # or
   bun install

3. **Configure Environment Variables:**
   
Create a .env.local file in the root directory and add your Gemini API key:

   GEMINI_API_KEY=your_actual_api_key_here

4. **Start the development server:**

   npm run dev
   # or
   bun dev

Open http://localhost:5173 (or the URL displayed in your terminal) to view the application.

---

**Available Scripts**

   npm run dev — Starts the local Vite development server.

   npm run build — Compiles TypeScript and builds the production bundle.

   npm run preview — Locally previews the production build.

   npm run lint — Runs ESLint to check code quality.

---

**Project Structure**

schema-architect/
├── components/       # Reusable UI elements (shadcn/ui & Radix primitives)
├── lib/              # Utility functions, helpers, and API client configurations
├── src/              # Core application logic, main components, and pages
│   ├── App.tsx       # Main application entry component
│   └── main.tsx      # Application mount point
├── .env.local        # Local environment variables (ignored by Git)
├── index.html        # HTML template
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── vite.config.ts    # Vite bundler configuration

   
