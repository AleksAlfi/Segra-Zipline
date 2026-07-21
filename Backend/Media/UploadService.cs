using Serilog;
using System.Net;
using System.Text.Json;
using Segra.Backend.App;
using Segra.Backend.Auth;
using Segra.Backend.Core;
using System.Diagnostics;
using Segra.Backend.Shared;
using System.Net.Http.Headers;
using Segra.Backend.Core.Models;

namespace Segra.Backend.Media
{
    internal static class UploadService
    {
        private static readonly HttpClient _httpClient = new()
        {
            Timeout = TimeSpan.FromMinutes(10)
        };

        private static readonly Dictionary<string, CancellationTokenSource> _activeUploads = new();
        private static readonly object _uploadLock = new();

        public static void CancelUpload(string fileName)
        {
            Log.Information($"[Upload] Cancel requested for: {fileName}");

            lock (_uploadLock)
            {
                if (_activeUploads.TryGetValue(fileName, out var cts))
                {
                    cts.Cancel();
                    Log.Information($"[Upload] Cancelled upload for: {fileName}");
                }
                else
                {
                    Log.Warning($"[Upload] No active upload found for: {fileName}");
                }
            }
        }

        public static async Task HandleUploadContent(JsonElement message)
        {
            string fileName = "";
            string title = "";
            CancellationTokenSource? cts = null;

            try
            {
                string filePath = message.GetProperty("FilePath").GetString()!;
                fileName = Path.GetFileName(filePath);
                string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(fileName);
                title = message.GetProperty("Title").GetString()!;

                if (!AuthService.IsAuthenticated())
                    throw new Exception("Not connected to a Zipline server. Connect in Settings > Account first.");

                cts = new CancellationTokenSource();
                lock (_uploadLock)
                {
                    _activeUploads[fileName] = cts;
                }

                byte[] fileBytes = await File.ReadAllBytesAsync(filePath, cts.Token);
                using var formData = new MultipartFormDataContent();

                int lastSentProgress = -1;
                void ProgressHandler(long sent, long total)
                {
                    if (total <= 0) return;
                    int progress = (int)(sent / (double)total * 100);

                    if (progress != lastSentProgress)
                    {
                        lastSentProgress = progress;

                        if (progress >= 100)
                        {
                            _ = MessageService.SendFrontendMessage("UploadProgress", new
                            {
                                title,
                                fileName,
                                progress = 100,
                                status = "processing",
                                message = "Processing..."
                            });
                        }
                        else
                        {
                            _ = MessageService.SendFrontendMessage("UploadProgress", new
                            {
                                title,
                                fileName,
                                progress,
                                status = "uploading",
                                message = $"Uploading... {progress}%"
                            });
                        }
                    }
                }

                // Upload under the clip title so "add original name" makes downloads use it
                var fileContent = new ProgressableStreamContent(fileBytes, GetContentType(fileName), ProgressHandler, cts.Token);
                formData.Add(fileContent, "file", BuildUploadFileName(title, fileName));

                await MessageService.SendFrontendMessage("UploadProgress", new
                {
                    title,
                    fileName,
                    progress = 0,
                    status = "uploading",
                    message = "Starting upload..."
                });

                var request = new HttpRequestMessage(HttpMethod.Post, $"{AuthService.ServerUrl}/api/upload")
                {
                    Content = formData
                };
                // Zipline expects the raw API token as the Authorization header (no "Bearer" scheme)
                request.Headers.TryAddWithoutValidation("Authorization", AuthService.ApiToken);
                request.Headers.TryAddWithoutValidation("x-zipline-original-name", "true");

                string? folderId = await GetOrCreateFolderIdAsync(cts.Token);
                if (folderId != null)
                    request.Headers.TryAddWithoutValidation("x-zipline-folder", folderId);

                string domain = NormalizeDomain(Settings.Instance.ZiplineDomain);
                if (!string.IsNullOrEmpty(domain))
                    request.Headers.TryAddWithoutValidation("x-zipline-domain", domain);

                var response = await _httpClient.SendAsync(request, cts.Token);
                response.EnsureSuccessStatusCode();

                lock (_uploadLock)
                {
                    _activeUploads.Remove(fileName);
                }

                await MessageService.SendFrontendMessage("UploadProgress", new
                {
                    title,
                    fileName,
                    progress = 100,
                    status = "done",
                    message = "Upload completed successfully"
                });

                var responseContent = await response.Content.ReadAsStringAsync();
                Log.Information($"Upload success: {responseContent}");

                // Parse the response to extract the URL and update the content with uploadId
                if (!string.IsNullOrEmpty(responseContent))
                {
                    try
                    {
                        var responseJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                        if (responseJson.TryGetProperty("files", out var filesElement) &&
                            filesElement.ValueKind == JsonValueKind.Array &&
                            filesElement.GetArrayLength() > 0 &&
                            filesElement[0].TryGetProperty("url", out var urlElement))
                        {
                            string url = urlElement.GetString()!;
                            if (!string.IsNullOrEmpty(url))
                            {
                                if (url.StartsWith('/'))
                                    url = AuthService.ServerUrl + url;

                                // Store the full Zipline share URL; the frontend uses it verbatim
                                string uploadId = url;
                                Log.Information($"Zipline share URL: {url}");

                                // Update the content with the uploadId
                                var contentList = AppState.Instance.Content.ToList();
                                Log.Information($"File name: {fileName}, without extension: {fileNameWithoutExtension}");

                                var contentToUpdate = contentList.FirstOrDefault(c =>
                                    Path.GetFileNameWithoutExtension(c.FileName) == fileNameWithoutExtension);
                                Log.Information($"Content to update: {contentToUpdate?.FileName ?? "not found"}");

                                if (contentToUpdate != null)
                                {
                                    contentToUpdate.UploadId = uploadId;

                                    // Also update the metadata file
                                    string metadataFolderPath = FolderNames.GetMetadataFolderPath(contentToUpdate.Type);
                                    string metadataFilePath = PathUtils.Combine(metadataFolderPath, $"{fileNameWithoutExtension}.json");

                                    var updatedContent = await ContentService.UpdateMetadataFile(metadataFilePath, content =>
                                    {
                                        content.UploadId = uploadId;
                                    });

                                    if (updatedContent != null)
                                    {
                                        Log.Information($"Updated metadata file with upload ID: {metadataFilePath}");
                                    }

                                    Log.Information($"Updated content with upload ID: {uploadId}");
                                    await SettingsService.LoadContentFromFolderIntoState(true);
                                }

                                // Open browser if setting is enabled
                                if (Settings.Instance.ClipShowInBrowserAfterUpload)
                                {
                                    Log.Information($"Opening URL in browser: {url}");
                                    Process.Start(new ProcessStartInfo
                                    {
                                        FileName = url,
                                        UseShellExecute = true
                                    });
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Log.Error($"Failed to parse upload response or update content: {ex.Message}");
                    }
                }
            }
            catch (OperationCanceledException)
            {
                Log.Information($"[Upload] Upload cancelled for: {fileName}");

                lock (_uploadLock)
                {
                    _activeUploads.Remove(fileName);
                }

                await MessageService.SendFrontendMessage("UploadProgress", new
                {
                    title,
                    fileName,
                    progress = 0,
                    status = "error",
                    message = "Upload cancelled"
                });
            }
            catch (Exception ex)
            {
                Log.Error($"Upload failed: {ex.Message}");

                lock (_uploadLock)
                {
                    if (!string.IsNullOrEmpty(fileName))
                        _activeUploads.Remove(fileName);
                }

                await MessageService.ShowModal(
                    "Upload Error",
                    "The upload failed.\n" + ex.Message,
                    "error",
                    "Could not upload clip"
                );

                await MessageService.SendFrontendMessage("UploadProgress", new
                {
                    title,
                    fileName,
                    progress = 0,
                    status = "error",
                    message = ex.Message
                });
            }
            finally
            {
                cts?.Dispose();
            }
        }

        public class ProgressableStreamContent : HttpContent
        {
            private readonly byte[] _content;
            private readonly Action<long, long> _progressCallback;
            private readonly CancellationToken _cancellationToken;

            public ProgressableStreamContent(byte[] content, string mediaType, Action<long, long> progressCallback, CancellationToken cancellationToken = default)
            {
                _content = content ?? throw new ArgumentNullException(nameof(content));
                _progressCallback = progressCallback;
                _cancellationToken = cancellationToken;
                Headers.ContentType = new MediaTypeHeaderValue(mediaType);
            }

            protected override async Task SerializeToStreamAsync(Stream stream, TransportContext? context)
            {
                long totalBytes = _content.Length;
                long totalWritten = 0;
                int bufferSize = 4096;

                for (int i = 0; i < _content.Length; i += bufferSize)
                {
                    _cancellationToken.ThrowIfCancellationRequested();

                    int toWrite = Math.Min(bufferSize, _content.Length - i);
                    await stream.WriteAsync(_content.AsMemory(i, toWrite), _cancellationToken);
                    totalWritten += toWrite;
                    _progressCallback?.Invoke(totalWritten, totalBytes);
                }
            }

            protected override bool TryComputeLength(out long length)
            {
                length = _content.Length;
                return true;
            }
        }

        // Resolves the configured Zipline folder name to its id, creating the folder if it doesn't
        // exist yet. Returns null (upload goes to the root) if disabled or resolution fails —
        // a missing folder should never block an upload.
        private static async Task<string?> GetOrCreateFolderIdAsync(CancellationToken cancellationToken)
        {
            string folderName = Settings.Instance.ZiplineFolder?.Trim() ?? string.Empty;
            if (string.IsNullOrEmpty(folderName))
                return null;

            try
            {
                var listRequest = new HttpRequestMessage(HttpMethod.Get, $"{AuthService.ServerUrl}/api/user/folders?noincl=true");
                listRequest.Headers.TryAddWithoutValidation("Authorization", AuthService.ApiToken);

                var listResponse = await _httpClient.SendAsync(listRequest, cancellationToken);
                listResponse.EnsureSuccessStatusCode();

                using var listDoc = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync(cancellationToken));
                foreach (var folder in listDoc.RootElement.EnumerateArray())
                {
                    if (folder.TryGetProperty("name", out var nameElement) &&
                        string.Equals(nameElement.GetString(), folderName, StringComparison.OrdinalIgnoreCase) &&
                        folder.TryGetProperty("id", out var idElement))
                    {
                        return idElement.GetString();
                    }
                }

                var createRequest = new HttpRequestMessage(HttpMethod.Post, $"{AuthService.ServerUrl}/api/user/folders")
                {
                    Content = new StringContent(
                        JsonSerializer.Serialize(new { name = folderName }),
                        System.Text.Encoding.UTF8, "application/json")
                };
                createRequest.Headers.TryAddWithoutValidation("Authorization", AuthService.ApiToken);

                var createResponse = await _httpClient.SendAsync(createRequest, cancellationToken);
                createResponse.EnsureSuccessStatusCode();

                using var createDoc = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync(cancellationToken));
                string? id = createDoc.RootElement.TryGetProperty("id", out var createdIdElement)
                    ? createdIdElement.GetString() : null;
                Log.Information($"Created Zipline folder '{folderName}' ({id})");
                return id;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                Log.Warning($"Could not resolve Zipline folder '{folderName}', uploading to root: {ex.Message}");
                return null;
            }
        }

        // The clip title becomes the multipart filename (keeping the real extension) so Zipline's
        // originalName — and therefore the download name — matches the clip, not the disk file.
        private static string BuildUploadFileName(string title, string fileName)
        {
            string sanitized = string.Concat(title.Split(Path.GetInvalidFileNameChars())).Trim();
            if (string.IsNullOrEmpty(sanitized))
                return fileName;

            if (sanitized.Length > 100)
                sanitized = sanitized[..100].Trim();

            return sanitized + Path.GetExtension(fileName);
        }

        private static string NormalizeDomain(string? domain)
        {
            domain = domain?.Trim() ?? string.Empty;
            domain = domain.Replace("https://", "", StringComparison.OrdinalIgnoreCase)
                           .Replace("http://", "", StringComparison.OrdinalIgnoreCase)
                           .TrimEnd('/');
            return domain;
        }

        private static string GetContentType(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".mp4" => "video/mp4",
            ".mkv" => "video/x-matroska",
            ".webm" => "video/webm",
            ".mov" => "video/quicktime",
            ".avi" => "video/x-msvideo",
            ".gif" => "image/gif",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            _ => "application/octet-stream"
        };
    }
}
