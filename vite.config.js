import { defineConfig } from "vite"; // Outil pour décrire la configuration de Vite

export default defineConfig({ // Configuration exportée
  server: { // Réglages du serveur de développement
    host: true, // Accessible aussi depuis le réseau local (utile pour tester au téléphone)
    port: 5173, // Port d'écoute : http://localhost:5173
  }, // Fin des réglages du serveur
  test: { // Réglages des tests (Vitest)
    environment: "node", // La logique métier se teste sans navigateur
    include: ["src/**/*.test.js"], // Cherche les tests dans src, fichiers *.test.js
  }, // Fin des réglages des tests
}); // Fin de la configuration
