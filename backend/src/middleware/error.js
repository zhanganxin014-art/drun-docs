/**
 * 统一错误处理中间件
 */
class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
    });
  }

  // Multer文件大小超限错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: '文件过大，请压缩后重试',
      code: 'FILE_TOO_LARGE',
    });
  }

  console.error('[Unhandled Error]', err);
  res.status(500).json({
    error: '服务器内部错误',
    code: 'INTERNAL_ERROR',
  });
};

module.exports = { AppError, errorHandler };
