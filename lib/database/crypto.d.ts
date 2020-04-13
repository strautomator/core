/**
 * Process and mutates the passed data with relevant fields getting encrypted.
 * @param data Data to be encrypted.
 * @param encrypt Should be true to encrypt, or false to decrypt.
 */
export declare function cryptoProcess(data: any, encrypt: boolean): void;
/**
 * Encrypt the passed value. Encrypted values are prefixed with "enc::".
 * @param value Value to be encrypted before saving.
 */
export declare function encryptData(value: string): string;
/**
 * Decrypt the passed value. Encrypted values must be prefixed with "enc::".
 * @param value Value to be decrypted after document fetching from the database.
 */
export declare function decryptData(value: string): string;
