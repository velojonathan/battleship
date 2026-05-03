// CSS Modules declarations for TypeScript. Vite handles the actual transformation.
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
