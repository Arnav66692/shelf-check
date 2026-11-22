import Foundation
import Vision
import ImageIO

struct Line: Codable { let text: String; let confidence: Float; let box: [Double] }
struct Result: Codable { let path: String; let lines: [Line]; let seconds: Double }

func recognize(_ path: String, correction: Bool) -> Result {
    let start = Date()
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        return Result(path: path, lines: [], seconds: 0)
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = correction
    request.minimumTextHeight = 0
    request.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try? handler.perform([request])
    let lines = (request.results ?? []).compactMap { observation -> Line? in
        guard let top = observation.topCandidates(1).first else { return nil }
        let b = observation.boundingBox
        return Line(text: top.string, confidence: top.confidence, box: [b.minX, b.minY, b.width, b.height])
    }
    return Result(path: path, lines: lines, seconds: Date().timeIntervalSince(start))
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: vision_ocr <list.txt> <out.jsonl> [--no-correction] [--workers N]\n".data(using: .utf8)!)
    exit(2)
}
let paths = try String(contentsOfFile: args[1], encoding: .utf8).split(separator: "\n").map(String.init).filter { !$0.isEmpty }
let correction = !args.contains("--no-correction")
var workers = 4
if let i = args.firstIndex(of: "--workers"), i + 1 < args.count, let n = Int(args[i + 1]) { workers = n }
var results = [Result?](repeating: nil, count: paths.count)
let lock = NSLock()
let queue = OperationQueue()
queue.maxConcurrentOperationCount = workers
for (i, path) in paths.enumerated() {
    queue.addOperation {
        let r = autoreleasepool { recognize(path, correction: correction) }
        lock.lock(); results[i] = r; lock.unlock()
    }
}
queue.waitUntilAllOperationsAreFinished()
let encoder = JSONEncoder()
var out = ""
for r in results { if let r = r, let d = try? encoder.encode(r) { out += String(data: d, encoding: .utf8)! + "\n" } }
try out.write(toFile: args[2], atomically: true, encoding: .utf8)
