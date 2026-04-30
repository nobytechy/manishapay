// ManishaPay — Java example. Java 11+ (uses java.net.http).
//
// Compile: javac Example.java
// Run:     API_KEY=mp_test_xxx java Example

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;

public class Example {

    public static void main(String[] args) throws Exception {
        String apiBase = System.getenv().getOrDefault("API_BASE", "https://api.manishapay.dev");
        String apiKey  = System.getenv("API_KEY");
        if (apiKey == null || apiKey.isBlank()) {
            System.err.println("Set API_KEY=mp_test_xxx first.");
            System.exit(1);
        }

        String reference = "INV-" + Instant.now().getEpochSecond();
        String body = String.format(
            "{\"reference\":\"%s\",\"amount\":\"10.00\",\"description\":\"Pro plan\",\"email\":\"buyer@test.com\"}",
            reference
        );

        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        HttpRequest req = HttpRequest.newBuilder(URI.create(apiBase + "/v1/pay"))
            .header("Authorization", "Bearer " + apiKey)
            .header("Content-Type", "application/json")
            .header("X-Request-Id", "java-" + Instant.now().toEpochMilli())
            .timeout(Duration.ofSeconds(15))
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 400) {
            System.err.println("ManishaPay error " + res.statusCode() + ": " + res.body());
            return;
        }
        System.out.println(res.body());
    }
}
