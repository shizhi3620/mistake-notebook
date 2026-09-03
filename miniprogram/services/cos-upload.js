function uploadToCos(credential, filePath) {
  if (!credential || credential.method !== "PUT" || !credential.uploadUrl || !credential.objectKey) {
    return Promise.reject(new Error("上传授权无效，请重新选择图片"));
  }
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: ({ data }) => {
        wx.request({
          url: credential.uploadUrl,
          method: "PUT",
          data,
          responseType: "text",
          header: credential.headers || { "content-type": "image/jpeg" },
          success: (response) => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
              resolve({ objectKey: credential.objectKey });
              return;
            }
            reject(new Error("图片上传失败，请重试"));
          },
          fail: () => reject(new Error("图片上传失败，请检查网络后重试")),
        });
      },
      fail: () => reject(new Error("无法读取选择的图片")),
    });
  });
}

module.exports = { uploadToCos };
