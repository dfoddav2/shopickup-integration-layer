# CDN Upload Pattern for Label Files

This document describes the recommended pattern for uploading label files from Shopickup adapters to your CDN (Content Delivery Network) and managing persistent URLs.

## Overview

Shopickup adapters return label PDFs in the `CreateLabelsResponse.files[]` array with base64-encoded data URLs. While this is convenient for testing and immediate delivery, production systems should upload these files to a CDN and replace the temporary URLs with persistent, optimized URLs.

## Response Structure

### LabelFileResource (File Artifact)
```typescript
export interface LabelFileResource {
  id: string;                    // UUID for this file
  dataUrl?: string;              // Base64 encoded: "data:application/pdf;base64,JVBERi0xLjQK..."
  url?: string;                  // Persistent CDN URL (set after upload)
  contentType: string;           // "application/pdf"
  byteLength: number;            // File size in bytes
  pages: number;                 // Number of pages (e.g., 3 for batch of 3 labels)
  orientation?: string;          // "portrait" | "landscape"
  metadata?: Record<string, any>; // Carrier-specific: { carrier: "foxpost", size: "A7", ... }
  checksum?: string;             // For integrity verification
  expiresAt?: Date;              // Suggested expiration time for temporary URLs
}
```

### LabelResult (Per-Parcel Result)
```typescript
export interface LabelResult {
  inputId: string;               // The parcel carrier ID you requested the label for
  status: 'created' | 'failed' | 'skipped';
  fileId: string;                // Reference to the file in files[] array
  pageRange?: { start: number, end: number }; // Pages in combined PDF (e.g., {start: 1, end: 1})
  errors?: Array<{ code: string, message: string }>;
  raw?: any;
}
```

### CreateLabelsResponse
```typescript
export interface CreateLabelsResponse {
  results: LabelResult[];        // One result per requested parcel
  files?: LabelFileResource[];   // Actual file artifacts
  successCount: number;
  failureCount: number;
  totalCount: number;
  allSucceeded: boolean;
  allFailed: boolean;
  someFailed: boolean;
  summary: string;
  rawCarrierResponse?: any;
}
```

## Upload Pattern

### Step 1: Extract Base64 Data from Response

```typescript
const response = await adapter.createLabels!(req, context);

// Each file in files[] array has a base64 dataUrl
response.files?.forEach(file => {
  // Extract base64 from data URL
  const base64Data = file.dataUrl?.split(',')[1]; // Remove "data:application/pdf;base64," prefix
  
  // Or convert to Buffer for Node.js
  const buffer = Buffer.from(base64Data!, 'base64');
});
```

### Step 2: Request Presigned Upload URL from Your Storage

Different storage services have different methods. Here are common examples:

#### AWS S3 (Using SDK v3)
```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

async function getPresignedS3Url(fileId: string): Promise<string> {
  const s3Client = new S3Client({ region: "us-east-1" });
  
  const command = new PutObjectCommand({
    Bucket: "my-labels-bucket",
    Key: `labels/${new Date().getFullYear()}/${fileId}.pdf`,
    ContentType: "application/pdf",
  });
  
  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return url;
}
```

#### Google Cloud Storage
```typescript
import { Storage } from "@google-cloud/storage";

async function getPresignedGcsUrl(fileId: string): Promise<string> {
  const storage = new Storage({ projectId: "my-project" });
  const bucket = storage.bucket("my-labels-bucket");
  const file = bucket.file(`labels/${fileId}.pdf`);
  
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 3600000, // 1 hour
  });
  
  return url;
}
```

#### Azure Blob Storage
```typescript
import { BlobServiceClient } from "@azure/storage-blob";

async function getPresignedAzureUrl(fileId: string): Promise<string> {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING!
  );
  
  const containerClient = blobServiceClient.getContainerClient("labels");
  const blockBlobClient = containerClient.getBlockBlobClient(`${fileId}.pdf`);
  
  const sasUrl = blockBlobClient.generateSasUrl({
    startsOn: new Date(),
    expiresOn: new Date(new Date().getTime() + 3600000), // 1 hour
    permissions: "racwd",
  });
  
  return sasUrl;
}
```

### Step 3: Upload File to CDN

```typescript
async function uploadLabelToCDN(
  presignedUrl: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const response = await fetch(presignedUrl, {
    method: 'PUT',
    body: buffer,
    headers: {
      'Content-Type': contentType,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }
}
```

### Step 4: Store Persistent URL in Database

After successful upload, store the persistent CDN URL (without query parameters/SAS tokens if possible):

```typescript
async function saveLabelResources(
  response: CreateLabelsResponse,
  db: Database
): Promise<void> {
  for (const file of response.files || []) {
    // Upload to CDN
    const presignedUrl = await getPresignedS3Url(file.id);
    const buffer = Buffer.from(file.dataUrl!.split(',')[1], 'base64');
    await uploadLabelToCDN(presignedUrl, buffer, file.contentType);
    
    // Get the public/persistent CDN URL
    const persistentUrl = `https://cdn.example.com/labels/${file.id}.pdf`;
    
    // Store in database
    await db.labelFiles.create({
      id: file.id,
      url: persistentUrl,
      contentType: file.contentType,
      pages: file.pages,
      byteLength: file.byteLength,
      metadata: file.metadata,
    });
  }
  
  // Store per-parcel results linking to files
  for (const result of response.results) {
    if (result.status === 'created') {
      const file = response.files?.find(f => f.id === result.fileId);
      
      await db.labelResults.create({
        parcelCarrierId: result.inputId,
        status: result.status,
        fileId: result.fileId,
        fileUrl: file?.url, // Now the persistent CDN URL
        pageRange: result.pageRange,
      });
    } else {
      await db.labelResults.create({
        parcelCarrierId: result.inputId,
        status: result.status,
        errors: result.errors,
      });
    }
  }
}
```

## Complete Example: Express Endpoint

```typescript
import express from 'express';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { AdapterContext } from '@shopickup/core';

const app = express();
const adapter = new FoxpostAdapter();

app.post('/api/labels', async (req, res) => {
  try {
    // 1. Create labels via adapter
    const response = await adapter.createLabels!(req.body, {
      http: httpClient,
      logger: console,
    });
    
    // 2. For each successful label, upload to CDN
    for (const file of response.files || []) {
      if (file.dataUrl) {
        // Get presigned URL
        const presignedUrl = await getPresignedS3Url(file.id);
        
        // Convert base64 to buffer
        const buffer = Buffer.from(file.dataUrl.split(',')[1], 'base64');
        
        // Upload
        await uploadLabelToCDN(presignedUrl, buffer, file.contentType);
        
        // Update file with persistent URL
        file.url = `https://cdn.example.com/labels/${file.id}.pdf`;
        
        // Store in database
        await db.labelFiles.create({
          id: file.id,
          url: file.url,
          pages: file.pages,
          contentType: file.contentType,
        });
      }
    }
    
    // 3. Store results linking to files
    for (const result of response.results) {
      await db.labelResults.create({
        parcelCarrierId: result.inputId,
        fileId: result.fileId,
        pageRange: result.pageRange,
      });
    }
    
    // 4. Return response with persistent URLs
    response.files?.forEach(file => {
      delete file.dataUrl; // Remove base64 from response to reduce payload
    });
    
    res.json({
      ...response,
      message: 'Labels created and uploaded to CDN successfully',
    });
    
  } catch (error) {
    console.error('Label creation failed:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
```

## Best Practices

### 1. **Separate Temporary and Persistent URLs**
   - `dataUrl`: Temporary, base64-encoded, used for immediate delivery (emails, SMS, etc.)
   - `url`: Persistent CDN URL, used for long-term storage and retrieval

### 2. **Handle Batch Files Efficiently**
   - Foxpost returns one PDF with multiple labels
   - Use `pageRange` to extract individual pages when needed
   - Don't duplicate the PDF per parcel—store once and reference via `fileId`

### 3. **Implement Cleanup**
   - Set expiration times on temporary URLs
   - Delete old CDN files based on retention policy
   - Archive labels to cold storage if needed

### 4. **Handle Upload Failures Gracefully**
   - If CDN upload fails, keep `dataUrl` available as fallback
   - Implement retry logic with exponential backoff
   - Log failures for debugging

### 5. **Secure Your URLs**
   - Use HTTPS exclusively
   - Consider signed URLs with expiration for sensitive shipments
   - Validate access based on user permissions

## Error Handling

```typescript
async function uploadWithRetry(
  presignedUrl: string,
  buffer: Buffer,
  maxRetries: number = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await uploadLabelToCDN(presignedUrl, buffer, 'application/pdf');
      return;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error; // Last attempt, re-throw
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.warn(`Upload attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Summary

1. **Receive** `CreateLabelsResponse` with `files[].dataUrl` (base64)
2. **Request** presigned PUT URL from your CDN
3. **Upload** binary PDF to CDN using presigned URL
4. **Store** the persistent `files[].url` in your database
5. **Return** URLs to merchant/frontend (optionally remove `dataUrl` to reduce payload)

This pattern decouples label generation from storage, allowing you to:
- Handle carrier responses immediately
- Upload to CDN asynchronously if needed
- Maintain persistent references to labels
- Optimize storage and delivery per your requirements
