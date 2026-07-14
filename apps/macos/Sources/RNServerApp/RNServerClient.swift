import Foundation

struct RNServerClient: Sendable {
    var projects: @Sendable () async throws -> [Project]
    var add: @Sendable (_ directory: String, _ tailscale: Bool) async throws -> Project
    var perform: @Sendable (_ id: String, _ action: ProjectAction) async throws -> Project
    var remove: @Sendable (_ id: String) async throws -> Project
    var setTailscale: @Sendable (_ id: String, _ enabled: Bool) async throws -> Project
}

extension RNServerClient {
    static func live(baseURL: URL = URL(string: "http://127.0.0.1:7231")!) -> Self {
        let transport = HTTPTransport(baseURL: baseURL)

        return Self(
            projects: { try await transport.request("projects") },
            add: { directory, tailscale in
                let body = try JSONSerialization.data(withJSONObject: [
                    "directory": directory,
                    "autoStart": true,
                    "tailscale": tailscale
                ])
                return try await transport.request("projects", method: "POST", body: body)
            },
            perform: { id, action in
                try await transport.request("projects/\(id.urlPathEncoded)/\(action.rawValue)", method: "POST")
            },
            remove: { id in
                try await transport.request("projects/\(id.urlPathEncoded)", method: "DELETE")
            },
            setTailscale: { id, enabled in
                let action = enabled ? "enable" : "disable"
                return try await transport.request("projects/\(id.urlPathEncoded)/tailscale/\(action)", method: "POST")
            }
        )
    }
}

private struct HTTPTransport: Sendable {
    let baseURL: URL
    let session = URLSession.shared

    func request<T: Decodable & Sendable>(
        _ path: String,
        method: String = "GET",
        body: Data? = nil
    ) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.httpBody = body
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "content-type") }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(http.statusCode) else {
            if let apiError = try? JSONDecoder().decode(APIError.self, from: data) {
                throw apiError
            }
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

private extension String {
    var urlPathEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? self
    }
}
