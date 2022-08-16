declare global {
  namespace NodeJS {
    interface ProcessEnv {
      VRF_SUBSCRIPTION_ID: string;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {};
