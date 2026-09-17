/// <reference types="vite/client" />

declare module '*.graphql?raw' {
  const src: string
  export default src
}
