// ManishaPay — C# example.
//
// Demonstrates that you can pass `2.00` as a STRING and ManishaPay handles
// the invariant-culture conversion server-side. The original C# SDK bug
// (System.FormatException) is impossible against ManishaPay because the
// gateway never asks the client to format decimals.
//
// .NET 6+. Run:
//   $env:API_KEY="mp_test_xxx"; dotnet run

using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;

class Example
{
    static async Task Main()
    {
        var apiBase = Environment.GetEnvironmentVariable("API_BASE") ?? "https://api.manishapay.dev";
        var apiKey  = Environment.GetEnvironmentVariable("API_KEY")
            ?? throw new InvalidOperationException("Set API_KEY=mp_test_xxx first.");

        using var http = new HttpClient { BaseAddress = new Uri(apiBase), Timeout = TimeSpan.FromSeconds(15) };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        http.DefaultRequestHeaders.Add("X-Request-Id", $"csharp-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}");

        var payload = new
        {
            reference   = $"INV-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}",
            amount      = "2.00",       // string, in any culture — gateway normalises
            description = "Pro plan",
            email       = "buyer@test.com"
        };

        var res = await http.PostAsJsonAsync("/v1/pay", payload);
        var json = await res.Content.ReadAsStringAsync();

        if (!res.IsSuccessStatusCode)
        {
            Console.Error.WriteLine($"ManishaPay error ({(int)res.StatusCode}): {json}");
            return;
        }

        using var doc = JsonDocument.Parse(json);
        var data = doc.RootElement.GetProperty("data");
        Console.WriteLine($"Browser URL: {data.GetProperty("browser_url").GetString()}");
        Console.WriteLine($"Reference  : {data.GetProperty("reference").GetString()}");
        Console.WriteLine($"Trace      : {doc.RootElement.GetProperty("requestId").GetString()}");
    }
}
