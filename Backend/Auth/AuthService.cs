using Segra.Backend.App;
using Serilog;
using System.Net;
using System.Text;
using System.Text.Json;

namespace Segra.Backend.Auth
{
    // Authenticates against a self-hosted Zipline server (https://github.com/diced/zipline).
    // Zipline auth is a static API token sent as a plain "Authorization: <token>" header,
    // so unlike the original Segra cloud there is no JWT refresh cycle.
    public static class AuthService
    {
        private static readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(30) };

        private static Core.Models.Auth Auth => Core.Models.Settings.Instance.Auth;

        // The avatar is a data URI that can be large, so it lives in memory instead of the settings file
        private static string? _avatar;

        public static bool IsAuthenticated() => Auth.HasCredentials();
        public static string ServerUrl => Auth.ServerUrl.TrimEnd('/');
        public static string ApiToken => Auth.ApiToken;

        public static async Task HandleLogin(JsonElement parameters)
        {
            try
            {
                string serverUrl = NormalizeServerUrl(
                    parameters.TryGetProperty("serverUrl", out var serverUrlElement) ? serverUrlElement.GetString() : null);
                if (string.IsNullOrEmpty(serverUrl))
                {
                    await SendAuthState(error: "A valid server URL is required");
                    return;
                }

                if (parameters.TryGetProperty("apiToken", out var tokenElement) &&
                    !string.IsNullOrWhiteSpace(tokenElement.GetString()))
                {
                    await LoginWithToken(serverUrl, tokenElement.GetString()!.Trim());
                    return;
                }

                string username = parameters.TryGetProperty("username", out var usernameElement)
                    ? usernameElement.GetString() ?? string.Empty : string.Empty;
                string password = parameters.TryGetProperty("password", out var passwordElement)
                    ? passwordElement.GetString() ?? string.Empty : string.Empty;
                string? code = parameters.TryGetProperty("code", out var codeElement)
                    ? codeElement.GetString() : null;

                if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
                {
                    await SendAuthState(error: "Username and password are required");
                    return;
                }

                await LoginWithPassword(serverUrl, username, password, code);
            }
            catch (HttpRequestException ex)
            {
                Log.Error(ex, "Could not reach Zipline server");
                await SendAuthState(error: "Could not reach the Zipline server. Check the URL and that the server is online.");
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Login failed");
                await SendAuthState(error: $"Login failed: {ex.Message}");
            }
        }

        private static async Task LoginWithToken(string serverUrl, string apiToken)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, $"{serverUrl}/api/user");
            request.Headers.TryAddWithoutValidation("Authorization", apiToken);

            var response = await _httpClient.SendAsync(request);
            if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                await SendAuthState(error: "Invalid API token");
                return;
            }
            response.EnsureSuccessStatusCode();

            var (username, avatar) = ParseUser(await response.Content.ReadAsStringAsync());
            CompleteLogin(serverUrl, apiToken, username, avatar);
            await SendAuthState();
        }

        private static async Task LoginWithPassword(string serverUrl, string username, string password, string? code)
        {
            // The password login gives us a session cookie, which we only use once to fetch the
            // permanent API token. The token is what gets stored and used for uploads.
            using var handler = new HttpClientHandler { CookieContainer = new CookieContainer(), UseCookies = true };
            using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(30) };

            var body = new Dictionary<string, string>
            {
                ["username"] = username,
                ["password"] = password
            };
            if (!string.IsNullOrEmpty(code))
                body["code"] = code;

            var loginContent = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            var loginResponse = await client.PostAsync($"{serverUrl}/api/auth/login", loginContent);
            string loginJson = await loginResponse.Content.ReadAsStringAsync();

            if (!loginResponse.IsSuccessStatusCode)
            {
                await SendAuthState(error: ExtractError(loginJson) ?? "Invalid username or password");
                return;
            }

            using var loginDoc = JsonDocument.Parse(loginJson);
            if (loginDoc.RootElement.TryGetProperty("totp", out var totpElement) && totpElement.GetBoolean() &&
                !loginDoc.RootElement.TryGetProperty("user", out _))
            {
                await SendAuthState(totpRequired: true);
                return;
            }

            string profileUsername = username;
            string? avatar = null;
            if (loginDoc.RootElement.TryGetProperty("user", out var userElement))
            {
                if (userElement.TryGetProperty("username", out var nameElement))
                    profileUsername = nameElement.GetString() ?? username;
                if (userElement.TryGetProperty("avatar", out var avatarElement) &&
                    avatarElement.ValueKind == JsonValueKind.String)
                    avatar = avatarElement.GetString();
            }

            var tokenResponse = await client.GetAsync($"{serverUrl}/api/user/token");
            string tokenJson = await tokenResponse.Content.ReadAsStringAsync();
            if (!tokenResponse.IsSuccessStatusCode)
            {
                await SendAuthState(error: ExtractError(tokenJson) ?? "Could not retrieve the API token from Zipline");
                return;
            }

            using var tokenDoc = JsonDocument.Parse(tokenJson);
            string? apiToken = tokenDoc.RootElement.TryGetProperty("token", out var apiTokenElement)
                ? apiTokenElement.GetString() : null;
            if (string.IsNullOrEmpty(apiToken))
            {
                await SendAuthState(error: "Zipline did not return an API token");
                return;
            }

            // The session cookie is no longer needed; close it so it doesn't linger in Zipline's session list
            try { await client.GetAsync($"{serverUrl}/api/auth/logout"); } catch { /* best effort */ }

            CompleteLogin(serverUrl, apiToken, profileUsername, avatar);
            await SendAuthState();
        }

        private static void CompleteLogin(string serverUrl, string apiToken, string username, string? avatar)
        {
            Auth.ServerUrl = serverUrl;
            Auth.ApiToken = apiToken;
            Auth.Username = username;
            _avatar = avatar;
            Log.Information($"Logged in to Zipline at {serverUrl} as {username}");
        }

        public static async Task HandleLogout()
        {
            Logout();
            await SendAuthState();
        }

        public static void Logout()
        {
            Log.Information("Logged out user");
            Auth.ServerUrl = string.Empty;
            Auth.ApiToken = string.Empty;
            Auth.Username = string.Empty;
            _avatar = null;
        }

        // Called on every new frontend connection: report the stored state immediately,
        // then refresh the profile (username/avatar) from the server in the background.
        public static async Task OnNewConnection()
        {
            await SendAuthState();
            if (IsAuthenticated())
                _ = Task.Run(RefreshProfileAsync);
        }

        private static async Task RefreshProfileAsync()
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, $"{ServerUrl}/api/user");
                request.Headers.TryAddWithoutValidation("Authorization", ApiToken);

                var response = await _httpClient.SendAsync(request);
                if (response.StatusCode == HttpStatusCode.Unauthorized)
                {
                    Log.Warning("Stored Zipline API token is no longer valid, logging out");
                    Logout();
                    await SendAuthState(error: "Your Zipline session is no longer valid. Please log in again.");
                    return;
                }
                if (!response.IsSuccessStatusCode)
                    return;

                var (username, avatar) = ParseUser(await response.Content.ReadAsStringAsync());
                Auth.Username = username;
                _avatar = avatar;
                await SendAuthState();
            }
            catch (Exception ex)
            {
                // Server unreachable (e.g. Proxmox box offline) — keep the stored credentials
                Log.Warning($"Could not refresh Zipline profile: {ex.Message}");
            }
        }

        public static Task SendAuthState(string? error = null, bool totpRequired = false)
        {
            return MessageService.SendFrontendMessage("AuthState", new
            {
                authenticated = IsAuthenticated(),
                serverUrl = Auth.ServerUrl,
                username = Auth.Username,
                avatar = _avatar,
                error,
                totpRequired
            });
        }

        private static (string username, string? avatar) ParseUser(string json)
        {
            using var doc = JsonDocument.Parse(json);
            var userElement = doc.RootElement.TryGetProperty("user", out var nested) ? nested : doc.RootElement;

            string username = userElement.TryGetProperty("username", out var nameElement)
                ? nameElement.GetString() ?? string.Empty : string.Empty;
            string? avatar = userElement.TryGetProperty("avatar", out var avatarElement) &&
                avatarElement.ValueKind == JsonValueKind.String
                ? avatarElement.GetString() : null;

            return (username, avatar);
        }

        private static string? ExtractError(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                return doc.RootElement.TryGetProperty("error", out var errorElement)
                    ? errorElement.GetString() : null;
            }
            catch
            {
                return null;
            }
        }

        private static string NormalizeServerUrl(string? url)
        {
            if (string.IsNullOrWhiteSpace(url))
                return string.Empty;

            url = url.Trim().TrimEnd('/');
            if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                url = $"https://{url}";
            }

            return Uri.TryCreate(url, UriKind.Absolute, out _) ? url : string.Empty;
        }
    }
}
