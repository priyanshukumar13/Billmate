const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

const useS3 = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET;

let s3Client = null;
if (useS3) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  });
} else {
  console.warn('⚠️ AWS S3 credentials not fully configured. Falling back to local filesystem storage.');
  // Ensure local upload directories exist
  const uploadsDir = path.join(__dirname, '../uploads');
  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
}

async function uploadFile(fileBuffer, fileName, folder = 'receipts') {
  if (useS3) {
    const key = `${folder}/${Date.now()}_${fileName}`;
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: fileBuffer,
    });
    await s3Client.send(command);
    return { key, location: `s3://${process.env.S3_BUCKET}/${key}` };
  } else {
    // Local fallback
    const targetDir = path.join(__dirname, `../${folder}`);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    
    const uniqueName = `${Date.now()}_${fileName}`;
    const targetPath = path.join(targetDir, uniqueName);
    fs.writeFileSync(targetPath, fileBuffer);
    
    const PORT = process.env.PORT || 5000;
    return { key: uniqueName, location: `http://localhost:${PORT}/${folder}/${uniqueName}` };
  }
}

async function getPresignedUrl(key, folder = 'receipts') {
  if (useS3) {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } else {
    // Local fallback URL
    const PORT = process.env.PORT || 5000;
    return `http://localhost:${PORT}/${folder}/${key}`;
  }
}

module.exports = {
  uploadFile,
  getPresignedUrl,
  useS3
};
