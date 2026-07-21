using System.Reflection;

namespace Segra.Backend.Core
{
    // Optional deployment defaults baked into the exe at build time via MSBuild properties
    // (dotnet publish -p:ZiplineDefaultUrl=... -p:ZiplineDefaultClipDomain=..., or
    // build-local.sh --url/--clipurl). Plain builds leave both empty, which keeps the
    // stock behavior: the user types their own server URL and share domain.
    public static class BuildConfig
    {
        public static string DefaultServerUrl { get; } = NormalizeUrl(GetMetadata("ZiplineDefaultUrl"));
        public static string DefaultClipDomain { get; } = NormalizeDomain(GetMetadata("ZiplineDefaultClipDomain"));

        private static string GetMetadata(string key) =>
            Assembly.GetExecutingAssembly()
                .GetCustomAttributes<AssemblyMetadataAttribute>()
                .FirstOrDefault(a => a.Key == key)?.Value?.Trim() ?? string.Empty;

        private static string NormalizeUrl(string url)
        {
            if (string.IsNullOrEmpty(url))
                return string.Empty;

            url = url.TrimEnd('/');
            if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                url = $"https://{url}";
            }

            return url;
        }

        private static string NormalizeDomain(string domain)
        {
            if (string.IsNullOrEmpty(domain))
                return string.Empty;

            return domain.Replace("https://", "", StringComparison.OrdinalIgnoreCase)
                         .Replace("http://", "", StringComparison.OrdinalIgnoreCase)
                         .TrimEnd('/');
        }
    }
}
