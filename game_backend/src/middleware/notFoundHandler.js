// PUBLIC_INTERFACE
/**
 * 404 Not Found handler middleware
 * Returns a consistent error response for undefined routes
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.url} not found`,
      statusCode: 404
    }
  });
};
