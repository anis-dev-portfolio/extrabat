// Déclarations globales du projet.
//
// Import DYNAMIQUE de CSS (ex. `import("leaflet/dist/leaflet.css")` dans
// components/carte-visites.tsx) : Next gère les imports statiques de CSS via
// ses propres types, mais un import() paresseux exige une déclaration de
// module explicite — sans elle, tsc ne résout pas le spécificateur.
declare module "*.css";
