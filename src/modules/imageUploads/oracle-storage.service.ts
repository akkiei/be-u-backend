// src/core/services/oracle-storage.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as objectStorage from 'oci-objectstorage';
import * as common from 'oci-common';

@Injectable()
export class OracleStorageService {
  private readonly logger = new Logger(OracleStorageService.name);
  private readonly client: objectStorage.ObjectStorageClient;
  private readonly namespace = process.env.OCI_NAMESPACE!;
  private readonly bucket = process.env.OCI_BUCKET!;
  private readonly region = process.env.OCI_REGION!;

  constructor() {
    let privateKey = process.env.OCI_PRIVATE_KEY || '';

    // Remove surrounding quotes if present
    if (
      (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))
    ) {
      privateKey = privateKey.slice(1, -1);
    }

    // Convert literal \n to real newlines and trim whitespace
    privateKey = privateKey.replace(/\\n/g, '\n').trim();

    // Normalize PEM: strip all whitespace from body, re-wrap at 64 chars
    const pemMatch = privateKey.match(
      /-----BEGIN ([A-Z ]+)-----\s*([\s\S]*?)\s*-----END \1-----/,
    );
    if (pemMatch) {
      const keyType = pemMatch[1];
      const base64Body = pemMatch[2].replace(/\s/g, '');
      const wrappedBody =
        base64Body.match(/.{1,64}/g)?.join('\n') ?? base64Body;
      privateKey = `-----BEGIN ${keyType}-----\n${wrappedBody}\n-----END ${keyType}-----`;
    }

    const provider = new common.SimpleAuthenticationDetailsProvider(
      process.env.OCI_TENANCY!,
      process.env.OCI_USER!,
      process.env.OCI_FINGERPRINT!,
      privateKey,
      null, // Passphrase (null if key is not encrypted)
      common.Region.fromRegionId(this.region),
    );

    this.client = new objectStorage.ObjectStorageClient({
      authenticationDetailsProvider: provider,
    });

    this.logger.log('Oracle Storage Client initialized');
  }

  async uploadObject(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    await this.client.putObject({
      namespaceName: this.namespace,
      bucketName: this.bucket,
      objectName: key,
      putObjectBody: buffer,
      contentLength: buffer.length,
      contentType: mimeType,
    });

    // Return the public URL — adjust if your bucket uses pre-authenticated requests
    return `https://objectstorage.${this.region}.oraclecloud.com/n/${this.namespace}/b/${this.bucket}/o/${encodeURIComponent(key)}`;
  }

  async getPreSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const response = await this.client.createPreauthenticatedRequest({
      namespaceName: this.namespace,
      bucketName: this.bucket,
      createPreauthenticatedRequestDetails: {
        name: `par-${Date.now()}`,
        objectName: key,
        accessType:
          objectStorage.models.CreatePreauthenticatedRequestDetails.AccessType
            .ObjectRead,
        timeExpires: new Date(Date.now() + expiresInSeconds * 1000),
      },
    });

    return `https://objectstorage.${this.region}.oraclecloud.com${response.preauthenticatedRequest.accessUri}`;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.deleteObject({
      namespaceName: this.namespace,
      bucketName: this.bucket,
      objectName: key,
    });
  }
}
