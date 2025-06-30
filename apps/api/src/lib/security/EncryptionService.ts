import crypto from 'crypto';

/**
 * Encryption service for sensitive data at rest
 * Uses AES-256-GCM algorithm with unique IV for each encryption
 */
export class EncryptionService {
  private static instance: EncryptionService;
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits

  private constructor() {
    // Validate encryption key on initialization
    this.validateEncryptionKey();
  }

  static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  private getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    if (key.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }

    try {
      return Buffer.from(key, 'hex');
    } catch (error) {
      throw new Error('ENCRYPTION_KEY must be a valid hex string');
    }
  }

  private validateEncryptionKey(): void {
    try {
      const key = this.getEncryptionKey();
      if (key.length !== this.keyLength) {
        throw new Error(`Encryption key must be exactly ${this.keyLength} bytes`);
      }
    } catch (error) {
      console.error('❌ Encryption key validation failed:', error);
      throw error;
    }
  }

  /**
   * Encrypts a plaintext string
   * @param text The plaintext to encrypt
   * @returns Encrypted string in format: iv:authtag:content
   */
  encrypt(text: string): string {
    if (!text) {
      throw new Error('Text to encrypt cannot be empty');
    }

    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from('panel1-encryption'));

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();

      // Format: iv:authtag:content
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('❌ Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts an encrypted string
   * @param encryptedString Encrypted string in format: iv:authtag:content
   * @returns Decrypted plaintext
   */
  decrypt(encryptedString: string): string {
    if (!encryptedString) {
      throw new Error('Encrypted string cannot be empty');
    }

    if (!this.isEncrypted(encryptedString)) {
      throw new Error('Invalid encrypted string format');
    }

    try {
      const key = this.getEncryptionKey();
      const parts = encryptedString.split(':');
      
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted string format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAuthTag(authTag);
      decipher.setAAD(Buffer.from('panel1-encryption'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('❌ Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Checks if a string is in encrypted format
   * @param str String to check
   * @returns True if string appears to be encrypted
   */
  isEncrypted(str: string): boolean {
    if (!str) return false;
    
    const parts = str.split(':');
    if (parts.length !== 3) return false;

    // Check if parts are valid hex strings of expected lengths
    const ivPart = parts[0];
    const tagPart = parts[1];
    const contentPart = parts[2];

    const hexRegex = /^[0-9a-f]+$/i;
    
    return (
      ivPart.length === this.ivLength * 2 &&
      tagPart.length === this.tagLength * 2 &&
      contentPart.length > 0 &&
      hexRegex.test(ivPart) &&
      hexRegex.test(tagPart) &&
      hexRegex.test(contentPart)
    );
  }

  /**
   * Generates a random encryption key for development/setup
   * @returns 64-character hex string suitable for ENCRYPTION_KEY
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Export singleton instance
export const encryptionService = EncryptionService.getInstance(); 